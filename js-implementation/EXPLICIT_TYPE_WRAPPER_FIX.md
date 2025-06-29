# Explicit PDF Type Wrapper Fix for Annotation #5

## Issue Analysis
**Problem**: Annotation #5 (multi-quad strikethrough) has empty numeric value causing `ValueError: invalid literal for int() with base 10: b''`

**Root Cause**: pdf-lib may not be properly serializing numeric values when using plain JavaScript numbers in the low-level `context.obj()` approach.

## Solution: Explicit PDF Type Wrappers

### **Approach**: Wrap ALL numeric values with pdf-lib's explicit type constructors

Instead of passing plain JavaScript values:
```javascript
// BEFORE: Plain JavaScript values
{
  Type: 'Annot',
  Subtype: 'StrikeOut', 
  Rect: [602.0, 2563.0, 1211.0, 2678.0],           // Plain numbers
  QuadPoints: [602.0, 2678.0, 1211.0, 2678.0, ...], // Plain numbers
  C: [1.0, 0.0, 0.0],                               // Plain numbers
  CA: 0.8,                                          // Plain number
  F: 4,                                             // Plain number
  Contents: PDFString.of("..."),
  P: page.ref
}
```

Use explicit PDF type wrappers:
```javascript
// AFTER: Explicit PDF type wrappers
{
  Type: PDFName.of('Annot'),                                    // ✅ Explicit PDFName
  Subtype: PDFName.of('StrikeOut'),                            // ✅ Explicit PDFName  
  Rect: pdfDoc.context.obj(rect.map(v => PDFNumber.of(v))),    // ✅ Explicit PDFNumber array
  QuadPoints: pdfDoc.context.obj(quads.map(v => PDFNumber.of(v))), // ✅ Explicit PDFNumber array
  C: pdfDoc.context.obj(colors.map(v => PDFNumber.of(v))),     // ✅ Explicit PDFNumber array  
  CA: PDFNumber.of(opacity),                                   // ✅ Explicit PDFNumber
  F: PDFNumber.of(4),                                          // ✅ Explicit PDFNumber
  Contents: PDFString.of("..."),                               // ✅ Already explicit
  P: page.ref                                                  // ✅ Already correct
}
```

### **Implementation**

```javascript
const explicitAnnotation = {
    Type: this.PDFLib.PDFName.of('Annot'),
    Subtype: this.PDFLib.PDFName.of(baseAnnotation.Subtype),
    Rect: pdfDoc.context.obj(baseAnnotation.Rect.map(v => this.PDFLib.PDFNumber.of(v))),
    QuadPoints: pdfDoc.context.obj(baseAnnotation.QuadPoints.map(v => this.PDFLib.PDFNumber.of(v))),
    C: pdfDoc.context.obj(baseAnnotation.C.map(v => this.PDFLib.PDFNumber.of(v))),
    CA: this.PDFLib.PDFNumber.of(baseAnnotation.CA),
    F: this.PDFLib.PDFNumber.of(4), // Explicit PDFNumber wrapper
    Contents: baseAnnotation.Contents, // Already wrapped with PDFString.of()
    P: page.ref
};
```

### **Why This Should Work**

1. **No Plain Numbers**: Every numeric value is explicitly wrapped with `PDFNumber.of()`
2. **No Plain Strings**: All strings use `PDFString.of()` or `PDFName.of()`
3. **Proper Arrays**: Arrays use `pdfDoc.context.obj()` with explicit element types
4. **No Undefined Values**: All properties are explicitly constructed
5. **Multi-Quad Preserved**: Maintains the proper multi-quad annotation structure

### **Expected Results**

✅ **No Empty Numeric Values**: Every number is explicitly typed  
✅ **Proper PDF Serialization**: pdf-lib knows exactly how to serialize each value  
✅ **Multi-Quad Support**: Preserves the required multi-line annotation behavior  
✅ **Adobe Acrobat Compatibility**: Should eliminate the parsing errors  

### **Key Differences from Previous Approaches**

1. **Keeps Multi-Quad**: Doesn't split annotations (maintains PDF spec compliance)
2. **Explicit Types**: Uses pdf-lib's type system instead of relying on automatic conversion
3. **Complete Coverage**: Wraps ALL numeric values, not just some
4. **Targeted Fix**: Addresses the exact serialization issue without changing annotation logic

This approach should ensure that annotation #5 (and all others) are serialized with proper numeric values that Adobe Acrobat's strict parser can handle, while maintaining the required multi-quad structure for multi-line text markup annotations.