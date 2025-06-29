# JavaScript Implementation - Document Annotation System

A pure JavaScript implementation of the document annotation system with multi-line text highlighting capabilities. This system processes hOCR files and PDF documents to create precise annotations and highlights based on text matching.

## Features

- **Text Matching**: Fuzzy string matching to find similar text in hOCR content
- **Bounding Box Extraction**: Extract precise coordinates for matched text
- **Multi-line Text Highlighting**: Create professional PDF highlights with multiple quads
- **PDF Annotation**: Add selectable annotations to PDF documents
- **Browser Compatible**: Works entirely in the browser using ES6 modules
- **Real-time Processing**: Interactive demos with immediate feedback

## Quick Start

### 1. Development Server

```bash
# Using http-server (recommended for Windows)
npm run dev

# Alternative: Using Python
npm run dev-python

# Alternative: Using Node.js built-in server
npm run dev-node
```

### 2. Access the Demo

Open your browser to `http://localhost:8080` and navigate to:
- `demo/text-highlighting-demo.html` - Interactive multi-line highlighting demo

### 3. Basic Usage

```javascript
import { DocumentProcessor } from './src/document-processor.js';

const processor = new DocumentProcessor({ debugMode: true });

// Process document with highlights
const result = await processor.processDocumentWithHighlights(
    hocrContent,      // hOCR HTML content
    pdfBytes,         // PDF file as Uint8Array
    "search text",    // Text to find and annotate
    formattedText,    // HTML with highlight markup
    {
        pageNumber: 0,
        color: [1, 0, 0],
        opacity: 0.3,
        highlightOpacity: 0.4
    }
);

if (result.success) {
    // Download the annotated PDF
    const blob = new Blob([result.annotatedPdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    // Create download link...
}
```

## Architecture

### Core Components

```
src/
├── document-processor.js     # Main orchestration class
├── text-highlighter.js      # Multi-line highlighting system
├── pdf-annotator-browser.js  # PDF manipulation with pdf-lib
├── text-matcher.js          # Fuzzy text matching algorithms
├── hocr-parser.js           # hOCR content parsing
└── bbox-extractor-simple.js # Bounding box coordinate extraction
```

### Data Flow

1. **hOCR Parsing** → Extract text content and word coordinates
2. **Text Matching** → Find similar text using fuzzy algorithms
3. **Bounding Box Extraction** → Calculate precise coordinates
4. **Word Filtering** → Extract words within target area
5. **Highlight Matching** → Map formatted text to word coordinates
6. **PDF Annotation** → Create professional annotations with QuadPoints

## API Reference

### DocumentProcessor

Main class that orchestrates the entire pipeline.

#### Constructor Options

```javascript
const processor = new DocumentProcessor({
    minSimilarity: 0.7,        // Minimum text similarity threshold
    debugMode: false,          // Enable detailed logging
    annotation: {              // PDF annotation options
        color: [1, 0, 0],
        opacity: 0.3,
        borderWidth: 2
    },
    highlighting: {            // Text highlighting options
        tolerance: 50,         // Bounding box padding
        fuzzyThreshold: 0.8    // Word matching threshold
    }
});
```

#### processDocumentWithHighlights()

Complete pipeline with multi-line text highlighting support.

```javascript
const result = await processor.processDocumentWithHighlights(
    hocrContent,    // string: Raw hOCR HTML content
    pdfBytes,       // Uint8Array: Original PDF bytes  
    searchText,     // string: Text to search for
    formattedText,  // string: HTML with highlight markup (optional)
    options         // object: Processing options
);
```

**Options:**
- `pageNumber` (number): Target page index (0-based)
- `color` (array): RGB color for main annotation [r, g, b]
- `opacity` (number): Main annotation opacity (0-1)
- `highlightOpacity` (number): Text highlight opacity (0-1)
- `hocrPageSize` (object): Custom hOCR dimensions `{width, height}`

**Returns:**
```javascript
{
    success: true,
    annotatedPdf: Uint8Array,     // Modified PDF with annotations
    matchResult: {                // Text matching results
        text: "matched text",
        similarity: 0.95,
        startIndex: 1250,
        endIndex: 1275
    },
    boundingBox: {                // Main annotation coordinates
        x1: 329, y1: 501, 
        x2: 1212, y2: 569
    },
    highlightCoordinates: [...],  // Array of highlight coordinate objects
    metadata: {                   // Processing metadata
        searchText: "...",
        similarity: 0.95,
        highlightsCreated: 2
    }
}
```

### TextHighlighter

Handles multi-line text highlighting with coordinate mapping.

#### parseFormattedText()

Extract highlight information from HTML markup.

```javascript
const highlighter = new TextHighlighter();
const highlights = highlighter.parseFormattedText(formattedText);

// Input example:
const formatted = `<strong style="background-color: rgb(254, 255, 1);">CIRCUIT AND METHOD</strong>`;

// Output:
[{
    text: "CIRCUIT AND METHOD",
    color: { r: 254, g: 255, b: 1 },
    hexColor: "#feff01"
}]
```

#### extractAllWordsFromHocr()

Extract all words with coordinates from hOCR content.

```javascript
const words = highlighter.extractAllWordsFromHocr(hocrContent);

// Returns:
[{
    text: "CIRCUIT",
    x1: 428, y1: 502, x2: 588, y2: 527
}, ...]
```

#### filterWordsWithinBoundingBox()

Filter words to those within a specific area with padding tolerance.

```javascript
const boundingBox = [329, 501, 1212, 569]; // [x1, y1, x2, y2]
const wordsInArea = highlighter.filterWordsWithinBoundingBox(allWords, boundingBox);
```

#### matchHighlightTextToWords()

Map highlight text sections to specific word coordinates for multi-line support.

```javascript
const highlightCoords = highlighter.matchHighlightTextToWords(wordsInArea, highlights);

// Returns array of highlight coordinate objects with quads:
[{
    text: "CIRCUIT AND METHOD",
    color: { r: 254, g: 255, b: 1 },
    hexColor: "#feff01",
    boundingBox: [428, 502, 856, 527],
    quads: [
        { x1: 428, y1: 502, x2: 588, y2: 527, text: "CIRCUIT" },
        { x1: 596, y1: 502, x2: 676, y2: 527, text: "AND" },
        { x1: 688, y1: 502, x2: 856, y2: 527, text: "METHOD" }
    ],
    words: [...], // Matched word objects
    wordCount: 3
}]
```

### PDFAnnotator

Browser-based PDF manipulation using pdf-lib.

#### addTextHighlights()

Create professional multi-line text highlights with QuadPoints support.

```javascript
const annotator = new PDFAnnotator({ debugMode: true });

const highlightedPdf = await annotator.addTextHighlights(
    pdfBytes,              // Uint8Array: Original PDF
    highlightCoordinates,  // Array: Highlight coordinate objects
    pageNumber,            // number: Target page (0-based)
    hocrPageSize,          // object: hOCR dimensions for coordinate transform
    { opacity: 0.5 }       // object: Highlight options
);
```

## Formatted Text Markup

The system supports HTML markup with `background-color` styles for highlights:

```html
<!-- Single highlight -->
<strong style="background-color: rgb(255, 255, 0);">TEXT TO HIGHLIGHT</strong>

<!-- Multiple highlights with different colors -->
<strong style="background-color: rgb(254, 255, 1);">CIRCUIT AND METHOD</strong>
<strong> FOR </strong>
<strong style="background-color: rgb(109, 217, 255);">OPERATING A CIRCUIT</strong>
```

**Supported Formats:**
- `rgb(r, g, b)` - RGB color values
- Nested within `<strong>` tags
- Multiple highlights in the same text

## Coordinate Systems

### hOCR Coordinates
- **Origin**: Top-left (0, 0)
- **Units**: Pixels
- **Format**: `bbox x1 y1 x2 y2`
- **Typical Size**: 2560 × 3300 pixels

### PDF Coordinates  
- **Origin**: Bottom-left (0, 0)
- **Units**: Points (1/72 inch)
- **Format**: `[x, y, width, height]`
- **Coordinate Transform**: Automatic scaling and Y-axis flipping

## Demo Files

### text-highlighting-demo.html

Interactive demo with real document processing:

**Features:**
- Live formatted text parsing
- Word extraction from real hOCR files
- Complete highlighting pipeline testing
- PDF generation with multi-line highlights
- Download annotated PDFs

**Required Files:**
- `demo/document.pdf` - Source PDF document
- `demo/document.hocr` - Corresponding hOCR file

### Test Functions

```javascript
// Test formatted text parsing
await testFormattedTextParsing();

// Test word extraction from hOCR
await testWordExtraction();  

// Test complete highlighting pipeline
await testTextHighlighting();

// Generate PDF with highlights
await generateSamplePDF();
```

## Error Handling

The system provides comprehensive error handling:

```javascript
const result = await processor.processDocumentWithHighlights(...);

if (!result.success) {
    console.error('Processing failed:', result.error);
    
    // Common error types:
    // - "No match found with sufficient similarity"
    // - "Failed to extract valid bounding box coordinates"  
    // - "Failed to load PDF/hOCR files"
    // - "Page X does not exist"
}
```

## Browser Compatibility

### Requirements
- ES6 module support
- Fetch API
- Modern JavaScript features (async/await, destructuring)
- pdf-lib CDN library

### Dependencies
```html
<!-- Required: pdf-lib for PDF manipulation -->
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>

<!-- ES6 modules -->
<script type="module">
    import { DocumentProcessor } from './src/document-processor.js';
    // ...
</script>
```

## Performance Considerations

### Text Processing
- **hOCR Parsing**: O(n) where n = file size
- **Word Extraction**: O(w) where w = number of words  
- **Bounding Box Filtering**: O(w) with spatial optimization
- **Text Matching**: O(t × h) where t = target text length, h = highlight text length

### Memory Usage
- PDF documents loaded entirely into memory
- hOCR content parsed as DOM elements
- Coordinate arrays for all words and highlights

### Optimization Tips
- Use `debugMode: false` in production
- Process smaller page ranges when possible
- Cache hOCR parsing results for multiple operations
- Consider Web Workers for large document processing

## Troubleshooting

### Common Issues

**"pdf-lib not loaded" Error**
```html
<!-- Make sure pdf-lib CDN is included -->
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
```

**Module Loading Failed**
- Ensure server is running from `js-implementation/` directory
- Check browser console for CORS errors
- Use `test-server.html` to verify module accessibility

**No Words Found in Bounding Box**
- Check hOCR coordinate system matches expectations
- Verify bounding box coordinates are valid
- Increase tolerance in TextHighlighter options
- Enable `debugMode` to see word extraction details

**Highlight Matching Issues**
- Verify formatted text uses correct HTML markup
- Check for HTML entity encoding in text
- Use fuzzy matching with lower thresholds
- Enable debug logging to see matching process

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
const processor = new DocumentProcessor({ 
    debugMode: true  // Enables console logging
});

// Example debug output:
// [DocumentProcessor] Parsing hOCR content...
// [TextHighlighter] Found 127 words in hOCR
// [TextHighlighter] Filtering 127 words within [329, 501, 1212, 569]
// [PDFAnnotator] Creating multi-line highlight annotation...
```

## Examples

### Complete Processing Pipeline

```javascript
// Load files
const pdfResponse = await fetch('./document.pdf');
const hocrResponse = await fetch('./document.hocr');
const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
const hocrContent = await hocrResponse.text();

// Create processor
const processor = new DocumentProcessor({ 
    debugMode: true,
    minSimilarity: 0.7
});

// Define search and highlight content
const searchText = "CIRCUIT AND METHOD FOR OPERATING A CIRCUIT";
const formattedText = `<strong style="background-color: rgb(254, 255, 1);">CIRCUIT AND METHOD</strong><strong> FOR </strong><strong style="background-color: rgb(109, 217, 255);">OPERATING A CIRCUIT</strong>`;

// Process document
const result = await processor.processDocumentWithHighlights(
    hocrContent,
    pdfBytes, 
    searchText,
    formattedText,
    {
        pageNumber: 0,
        color: [1, 0, 0],      // Red rectangle
        opacity: 0.3,
        highlightOpacity: 0.4   // Semi-transparent highlights
    }
);

// Handle results
if (result.success) {
    console.log(`Created ${result.metadata.highlightsCreated} highlights`);
    
    // Create download
    const blob = new Blob([result.annotatedPdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotated-document.pdf';
    link.click();
} else {
    console.error('Processing failed:', result.error);
}
```

### Standalone Text Highlighting

```javascript
import { TextHighlighter } from './src/text-highlighter.js';

const highlighter = new TextHighlighter({ debugMode: true });

// Parse highlights from formatted text
const formattedText = `<strong style="background-color: rgb(255, 0, 0);">IMPORTANT TEXT</strong>`;
const highlights = highlighter.parseFormattedText(formattedText);

// Extract words from hOCR
const words = highlighter.extractAllWordsFromHocr(hocrContent);

// Filter to target area
const boundingBox = [100, 100, 500, 200];
const wordsInArea = highlighter.filterWordsWithinBoundingBox(words, boundingBox);

// Create highlight coordinates
const highlightCoords = highlighter.matchHighlightTextToWords(wordsInArea, highlights);

console.log(`Created ${highlightCoords.length} highlight coordinate sets`);
```

## Contributing

### Development Setup

1. **Clone Repository**
```bash
git clone <repository-url>
cd closest-match/js-implementation
```

2. **Install Dependencies**
```bash
npm install
```

3. **Start Development Server**
```bash
npm run dev
```

4. **Run Tests**
```bash
npm test
```

### Code Style

- Use ES6 modules and modern JavaScript features
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Include error handling for all async operations
- Enable debug logging for troubleshooting

### Testing

Place test documents in `demo/` directory:
- `document.pdf` - Source PDF file
- `document.hocr` - Corresponding hOCR file

Use the interactive demo at `demo/text-highlighting-demo.html` for testing new features.