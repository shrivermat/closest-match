# WASM & TypeScript Deployment Guide

## Overview
This document explains how WebAssembly (WASM) and TypeScript are built, deployed, and served in this document annotation project. It includes critical lessons learned about selectable PDF annotations, Interactive Code Playground functionality, and proper deployment workflows.

## Directory Structure

```
closest-match/
├── src/                     # Rust source code
│   ├── lib.rs              # Rust library entry point
│   ├── hocr_parser.rs      # hOCR parsing logic
│   ├── string_matching.rs  # Text matching algorithms
│   └── document-annotator.ts # TypeScript WASM consumer
├── pkg/                     # wasm-pack output (generated)
│   ├── document_annotator.js         # JS bindings (generated)
│   ├── document_annotator_bg.wasm    # Optimized WASM binary
│   └── document_annotator.d.ts       # TypeScript definitions
├── dist/                    # Webpack output & dev server root
│   ├── index.js            # Compiled TypeScript bundle
│   ├── document_annotator_bg.wasm    # WASM file for serving
│   ├── *.wasm              # Hashed WASM files from webpack
│   └── index.html          # Demo page
└── target/                  # Rust compilation output
    └── wasm32-unknown-unknown/release/document_annotator.wasm # Raw WASM
```

## Build Process Flow

### 1. WASM Build (`npm run build:wasm`)
```bash
wasm-pack build --target web --out-dir pkg
```

**What happens:**
1. Compiles Rust code to raw WASM (`target/wasm32-unknown-unknown/release/document_annotator.wasm`)
2. Runs `wasm-opt` to optimize the WASM binary
3. Generates JavaScript bindings (`pkg/document_annotator.js`)
4. Creates optimized WASM file (`pkg/document_annotator_bg.wasm`)
5. Generates TypeScript definitions (`pkg/document_annotator.d.ts`)

**Output files in `pkg/`:**
- `document_annotator.js` - Contains WASM loading and binding code
- `document_annotator_bg.wasm` - Optimized WASM binary (~1MB)
- `document_annotator.d.ts` - TypeScript type definitions

### 2. JavaScript Build (`npm run build:js`)
```bash
webpack --mode production
```

**What happens:**
1. Compiles TypeScript source (`src/index.ts` + dependencies)
2. Bundles with dependencies into `dist/index.js`
3. Copies WASM files to `dist/` with content hashes
4. Generates source maps and type definitions

**File naming issue:** Webpack creates hashed WASM files (e.g., `916dc0c208e3d4de03c8.wasm`) but the JavaScript bindings look for `document_annotator_bg.wasm`.

### 3. Development Server (`npm run dev`)
```bash
webpack serve --mode development
```

**What happens:**
1. Starts webpack dev server on port 9000
2. Serves files from `dist/` directory (configured in `webpack.config.js`)
3. Enables hot module replacement
4. Watches for file changes and rebuilds

## WASM Loading Mechanism

### Import Chain
```typescript
// src/document-annotator.ts
const wasmModuleImport = await import('../pkg/document_annotator');
await wasmModuleImport.default(); // Initialize WASM
```

### Generated JavaScript (pkg/document_annotator.js)
```javascript
// Default WASM loading logic
if (typeof module_or_path === 'undefined') {
    module_or_path = new URL('document_annotator_bg.wasm', import.meta.url);
}
```

**Key insight:** The WASM is loaded relative to where the JavaScript bundle is served from. Since the bundle is at `http://localhost:9000/index.js`, it looks for WASM at `http://localhost:9000/document_annotator_bg.wasm`.

## Current Deployment Issues

### Problem 1: File Naming Mismatch
- **Webpack** creates hashed WASM files: `916dc0c208e3d4de03c8.wasm`
- **JavaScript bindings** look for: `document_annotator_bg.wasm`
- **Solution:** Copy `pkg/document_annotator_bg.wasm` to `dist/document_annotator_bg.wasm`

### Problem 2: Multiple WASM Versions
Current `dist/` directory contains:
```bash
-rwxrwxrwx 1059316 bytes  66d4ada2265cd7d03f46.wasm     # Old version
-rwxrwxrwx 1059302 bytes  916dc0c208e3d4de03c8.wasm     # Newer version
-rwxrwxrwx 1059302 bytes  document_annotator_bg.wasm    # Expected name
```

### Problem 3: Dev Server Caching
- Webpack dev server may cache old WASM files
- Browser may cache WASM binaries
- Hot module replacement doesn't always refresh WASM

## Verification Steps

### 1. Check WASM File Exists
```bash
ls -la /mnt/c/Repos/closest-match/dist/document_annotator_bg.wasm
```

### 2. Verify File Size/Date
```bash
ls -la /mnt/c/Repos/closest-match/pkg/document_annotator_bg.wasm
ls -la /mnt/c/Repos/closest-match/dist/document_annotator_bg.wasm
```
Files should have same size and `dist/` version should be newer.

### 3. Check Network Tab
- Look for request to `document_annotator_bg.wasm`
- Verify it returns 200 OK, not 404
- Check file size matches expected (~1MB)

### 4. Test WASM Functions
```javascript
// Should work if WASM loaded correctly
const wasmModuleImport = await import('./pkg/document_annotator');
await wasmModuleImport.default();
console.log('Available functions:', Object.keys(wasmModuleImport));
```

## Deployment Workflow

### For Development Changes:
1. **Modify Rust code** in `src/`
2. **Build WASM:** `npm run build:wasm`
3. **Copy to dist:** `cp pkg/document_annotator_bg.wasm dist/`
4. **Hard refresh browser** (Ctrl+Shift+R)
5. **Verify in Network tab** that new WASM loads

### For Production Build:
1. **Build WASM:** `npm run build:wasm`
2. **Build JS:** `npm run build:js`
3. **Copy WASM:** `cp pkg/document_annotator_bg.wasm dist/`
4. **Deploy `dist/` directory**

## Debugging Tips

### Check WASM Loading
```javascript
// Add to browser console
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('.wasm'))
  .forEach(r => console.log(r.name, r.responseEnd - r.fetchStart + 'ms'));
```

### Verify WASM Functions
```javascript
// Test direct WASM import
import('./pkg/document_annotator').then(async (wasm) => {
  await wasm.default();
  console.log('WASM functions:', Object.keys(wasm));
});
```

### Force Clear Caches
1. **Dev server restart:** Kill webpack process and restart
2. **Browser cache:** Hard refresh (Ctrl+Shift+R)  
3. **Incognito mode:** Use fresh browser context
4. **Clear webpack cache:** Delete `node_modules/.cache/`

## File Size Reference
- **Raw Rust WASM:** ~1.6MB (`target/` directory)
- **Optimized WASM:** ~1MB (`pkg/` and `dist/` directories)
- **Size differences:** Indicate different versions/optimizations

## TypeScript Compilation & PDF Annotation Issues

### Critical Learning: Multiple Code Paths for Annotations

**Problem:** The project has multiple ways to create PDF annotations:
1. **TypeScript PDF Annotator** (`src/pdf-annotator.ts`) - Compiled to `dist/index.js`
2. **Interactive Playground** (`dist/index.html`) - Direct inline JavaScript

**Issue:** Changes to `src/pdf-annotator.ts` only affect the compiled TypeScript bundle, NOT the Interactive Code Playground which uses its own annotation creation logic.

### TypeScript Build Process

```bash
npm run build     # Builds both WASM and TypeScript
npm run build:js  # TypeScript only
npm run build:wasm # WASM only
```

**What gets compiled:**
- `src/pdf-annotator.ts` → Bundled into `dist/index.js`
- `src/document-annotator.ts` → Bundled into `dist/index.js`
- All `src/*.ts` files → Compiled and bundled

**What does NOT get compiled:**
- `dist/index.html` - Direct HTML/JavaScript, no compilation step
- Inline JavaScript in HTML files

### Selectable PDF Annotations - Critical Fix

**Problem:** PDF annotations were showing "100%" labels and weren't selectable.

**Root Cause:** Two issues:
1. Using `page.drawRectangle()` creates visual drawings, not selectable annotations
2. PDF-lib requires `Contents` field to be `PDFLib.PDFString.of(text)` for proper string formatting

**Solution Applied to BOTH Code Paths:**

#### 1. TypeScript PDF Annotator (`src/pdf-annotator.ts`)
```typescript
// Create selectable annotation object
const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [x, y, x + width, y + height],
    C: [style.borderColor.r, style.borderColor.g, style.borderColor.b],
    CA: style.opacity,
    BS: { W: style.borderWidth, S: 'S' },
    F: 4, // Print flag - makes annotation selectable
    Contents: PDFLib.PDFString.of(`Text Match: ${match.text}`)
});
```

#### 2. Interactive Playground (`dist/index.html`)
```javascript
// Same solution applied to inline JavaScript
const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [pdfCoords.x, pdfCoords.y, pdfCoords.x + pdfCoords.width, pdfCoords.y + pdfCoords.height],
    C: [color.r / 255, color.g / 255, color.b / 255],
    CA: 0.8,
    F: 4, // Print flag
    BS: { W: 2, S: 'S' },
    Contents: PDFLib.PDFString.of(`Text Match: ${match.text}`)
});
```

**Key Requirements for Selectable Annotations:**
- ✅ Use `pdfDoc.context.obj()` instead of `page.drawRectangle()`
- ✅ Set `F: 4` flag for selectable/printable annotations
- ✅ Use `PDFLib.PDFString.of()` for Contents field to prevent "Expected a string object" errors
- ✅ Remove percentage score labels completely

### Interactive Code Playground Restoration

**Problem:** The Interactive Code Playground was broken - dropdown and execute button did nothing.

**Root Cause:** Missing event handlers and code execution engine.

**Fixed Components:**
1. **Event Listeners:** Added `attachPlaygroundEventListeners()` function
2. **Code Execution:** Added `executeCode()` function with async support
3. **Result Formatting:** Added `displayExecutionResult()` with specialized formatting
4. **Error Handling:** Added try-catch with fallback to visual annotations
5. **Sample Data:** Made `legalContract` and `medicalReport` available globally

**Critical Fix for Async Code:**
```javascript
// Before (broken):
const func = new Function(`${codeTextarea.value}`);

// After (working):
const func = new Function(`
    return (async function() {
        ${codeTextarea.value}
    })();
`);
```

### Deployment Workflow - Updated

#### For Development (Full Stack Changes):
1. **Modify Rust code** in `src/` (if needed)
2. **Modify TypeScript** in `src/` (if needed)
3. **Build everything:** `npm run build`
4. **Copy WASM files:** `cp pkg/document_annotator.js dist/ && cp pkg/document_annotator_bg.wasm dist/`
5. **Restart dev server:** `npm run dev`
6. **Hard refresh browser** (Ctrl+Shift+R)

#### For TypeScript-only Changes:
1. **Modify TypeScript** in `src/`
2. **Build TypeScript:** `npm run build:js`
3. **Hard refresh browser** (Ctrl+Shift+R)

#### For Playground-only Changes:
1. **Modify `dist/index.html`** directly
2. **Refresh browser** (no build step needed)

#### For WASM-only Changes:
1. **Modify Rust** in `src/`
2. **Build WASM:** `npm run build:wasm`
3. **Copy WASM:** `cp pkg/document_annotator.js dist/ && cp pkg/document_annotator_bg.wasm dist/`
4. **Hard refresh browser** (Ctrl+Shift+R)

### Version Management

**Current Version:** 0.4.0 (updated in both `Cargo.toml` and `package.json`)

**WASM Version Logging:**
```javascript
// Check WASM version in browser console
wasmFunctions.get_version(); // Returns "0.4.0"
wasmFunctions.log_version_info(); // Logs detailed version info
```

### Troubleshooting Guide

#### Problem: PDF Shows "Expected a string object" Error
**Solution:** Ensure `Contents` field uses `PDFLib.PDFString.of(text)`
```javascript
// Wrong:
Contents: "Some text"

// Correct:
Contents: PDFLib.PDFString.of("Some text")
```

#### Problem: Annotations Not Selectable
**Solution:** Use annotation objects, not drawings
```javascript
// Wrong (visual only):
page.drawRectangle({...});

// Correct (selectable):
const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    F: 4, // Selectable flag
    ...
});
```

#### Problem: Interactive Playground Not Working
**Check List:**
- ✅ Event listeners attached on page load
- ✅ `DocumentAnnotator` class available globally
- ✅ Sample data (`legalContract`, `medicalReport`) available
- ✅ Async function wrapper for code execution

#### Problem: TypeScript Changes Not Reflected
**Solution:** Remember the build step
1. `npm run build:js` (or `npm run build`)
2. Hard refresh browser
3. Check `dist/index.js` timestamp

#### Problem: WASM Functions Not Available
**Check:**
1. WASM file copied: `ls -la dist/document_annotator_bg.wasm`
2. Network tab shows successful WASM load (not 404)
3. Console shows WASM version logs
4. WASM initialization completed without errors

### Performance Notes

**File Sizes:**
- **Raw Rust WASM:** ~1.6MB (`target/` directory)
- **Optimized WASM:** ~1MB (`pkg/` and `dist/` directories)  
- **TypeScript Bundle:** ~460KB (`dist/index.js`)
- **Total Bundle Size:** ~1.5MB (within acceptable limits)

### Advanced Feature: Formatted Text Highlighting

**New Feature:** Added support for creating text highlight annotations within rectangle annotations based on `formattedText` property.

**How it works:**
1. **Rectangle annotation** created for the main search text
2. **Text highlight annotations** created for specific words/phrases within the rectangle
3. **WASM word extraction** from hOCR data for precise positioning
4. **Multi-line support** with automatic quad merging

**Usage Example:**
```javascript
const searchQueries = [{
    text: "(54) CIRCUIT AND METHOD FOR OPERATING A CIRCUIT",
    formattedText: "<strong>(54) </strong><strong style=\"background-color: rgb(254, 255, 1);\">CIRCUIT AND METHOD</strong><strong> FOR </strong><strong style=\"background-color: rgb(109, 217, 255);\">OPERATING A CIRCUIT</strong>",
    annotationType: "rectangle",
    formatting: {
        color: "#ff0000",
        backgroundColor: "#ffff00"
    }
}];
```

**Result:**
- ✅ Main rectangle annotation around entire text
- ✅ Yellow text highlight on "CIRCUIT AND METHOD"
- ✅ Blue text highlight on "OPERATING A CIRCUIT"
- ✅ All annotations are selectable in PDF viewers

**Technical Implementation:**
1. **Parse formatted text:** Extract `background-color` styles from HTML
2. **Extract word coordinates:** Use WASM to get word-level bounding boxes from hOCR
3. **Create highlight quads:** Group words by line, merge adjacent highlights
4. **Transform coordinates:** Use WASM coordinate transformation for accurate positioning
5. **Generate annotations:** Create PDF `Highlight` annotation objects

**Available in Interactive Code Playground:**
- Select "Formatted Text Highlighting" example
- Shows complete implementation with logging
- Demonstrates both rectangle and text highlight creation

### Next Steps
1. ✅ Verify correct WASM file in `dist/document_annotator_bg.wasm`
2. ✅ Check Network tab shows successful WASM load
3. ✅ Test debug functions are available
4. ✅ Verify coordinate fixes are working
5. ✅ Verify selectable annotations working in Acrobat
6. ✅ Verify Interactive Code Playground fully functional
7. ✅ Document TypeScript compilation requirements
8. ✅ Document PDF annotation best practices
9. ✅ Implement formatted text highlighting feature
10. ✅ Add Interactive Code Playground example for formatted text