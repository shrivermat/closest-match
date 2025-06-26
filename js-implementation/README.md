# Closest Match - JavaScript Implementation

Pure JavaScript implementation of the document annotation system, providing text matching and PDF annotation capabilities without WASM dependencies.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:8080/demo/
```

## Architecture

- **text-matcher.js** - Core string matching algorithm (ported from Python)
- **hocr-parser.js** - HTML-based OCR file parsing using DOM APIs
- **bbox-extractor.js** - Bounding box coordinate extraction
- **pdf-annotator.js** - PDF annotation using pdf-lib.js
- **document-processor.js** - Main orchestration class

## Features

- ✅ Pure JavaScript - no build pipeline required
- ✅ Browser native DOM parsing for hOCR files
- ✅ Client-side PDF annotation with pdf-lib
- ✅ Simple development setup with built-in Python server
- ✅ Direct algorithm ports from proven Python implementation

## Usage

```javascript
import { DocumentProcessor } from './src/document-processor.js';

const processor = new DocumentProcessor();
const result = await processor.processDocument(hocrContent, pdfBytes, searchText);
```

## Testing

Compare results directly with the WASM implementation in the parent directory to ensure accuracy.