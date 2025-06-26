# Document Annotator WASM

A WebAssembly-based document annotation system that finds text matches in hOCR files and automatically generates annotated PDF documents with visual callouts.

## Features

- **Fast String Matching**: WASM-optimized algorithms for finding text in OCR documents
- **PDF Annotation**: Automatic generation of annotated PDFs with visual callouts
- **Cross-Platform**: Works in browsers, Node.js, and serverless environments
- **Memory Efficient**: Processes documents using memory streams without file system dependencies
- **Batch Processing**: Support for multiple search queries and document pages
- **TypeScript Support**: Full type definitions and API documentation

## Quick Start

### Prerequisites

- Node.js 18+ 
- Rust 1.70+
- wasm-pack

### Installation

1. **Install Rust and wasm-pack**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   cargo install wasm-pack
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

### Usage

#### Basic Example

```typescript
import { DocumentAnnotator } from 'document-annotator';

const annotator = new DocumentAnnotator();

// Define page to process
const pageObj = {
  hocrUrl: 'https://example.com/document.hocr',
  pdfUrl: 'https://example.com/document.pdf',
  docUID: 'doc-123',
  pageNumber: 1
};

// Process single page
const result = await annotator.annotatePage('search text', pageObj);
console.log(`Found ${result.matches.length} matches`);

// Download annotated PDF
const url = URL.createObjectURL(result.pdfData);
const a = document.createElement('a');
a.href = url;
a.download = 'annotated.pdf';
a.click();
```

#### Advanced Example

```typescript
import { DocumentAnnotator } from 'document-annotator';
import type { SearchQuery, PageObject } from 'document-annotator';

const annotator = new DocumentAnnotator();

// Define multiple search queries
const searchQueries: SearchQuery[] = [
  { 
    text: 'voltage regulator', 
    annotationType: 'rectangle',
    formatting: { color: '#ff0000' }
  },
  { 
    text: 'circuit section', 
    annotationType: 'highlight',
    formatting: { backgroundColor: '#ffff00' }
  }
];

// Define multiple pages
const pageObjects: PageObject[] = [
  {
    hocrUrl: 'https://example.com/page1.hocr',
    pdfUrl: 'https://example.com/page1.pdf',
    docUID: 'patent-123',
    pageNumber: 1
  },
  {
    hocrUrl: 'https://example.com/page2.hocr',
    pdfUrl: 'https://example.com/page2.pdf',
    docUID: 'patent-123',
    pageNumber: 2
  }
];

// Processing options
const options = {
  tolerance: 0.8,
  maxResults: 10,
  enableCaching: true,
  outputFormat: 'blob' as const,
  parallelProcessing: true
};

// Process all pages
const results = await annotator.annotatePages(searchQueries, pageObjects, options);

results.forEach(result => {
  console.log(`Page ${result.pageNumber}: ${result.matches.length} matches in ${result.processingTime}ms`);
});
```

## API Reference

### DocumentAnnotator

The main class for document annotation operations.

#### Methods

##### `annotatePage(searchQuery, pageObject, options?)`

Processes a single page with a single search query.

**Parameters:**
- `searchQuery: string` - Text to search for
- `pageObject: PageObject` - Page information and URLs
- `options?: Partial<ProcessingOptions>` - Processing options

**Returns:** `Promise<AnnotatedPage>`

##### `annotatePages(searchQueries, pageObjects, options?)`

Processes multiple pages with multiple search queries.

**Parameters:**
- `searchQueries: SearchQuery[]` - Array of search queries
- `pageObjects: PageObject[]` - Array of page objects
- `options?: ProcessingOptions` - Processing options

**Returns:** `Promise<AnnotatedPage[]>`

##### `testWasm()`

Tests if the WASM module is working correctly.

**Returns:** `Promise<boolean>`

### Types

#### SearchQuery
```typescript
interface SearchQuery {
  text: string;
  formatting?: {
    color?: string;
    backgroundColor?: string;
    decorations?: ('underline' | 'strikethrough')[];
  };
  annotationType: 'rectangle' | 'highlight' | 'underline' | 'strikethrough';
}
```

#### PageObject
```typescript
interface PageObject {
  hocrUrl: string;
  pdfUrl: string;
  docUID: string;
  pageNumber: number;
  metadata?: Record<string, any>;
}
```

#### ProcessingOptions
```typescript
interface ProcessingOptions {
  tolerance: number;           // 0.0 - 1.0, matching tolerance
  maxResults: number;          // Maximum results per page
  enableCaching: boolean;      // Use IndexedDB caching
  outputFormat: 'blob' | 'base64' | 'arrayBuffer';
  parallelProcessing: boolean; // Use Web Workers
}
```

#### AnnotatedPage
```typescript
interface AnnotatedPage {
  docUID: string;
  pageNumber: number;
  pdfData: Blob | string | ArrayBuffer;
  matches: MatchResult[];
  processingTime: number;
}
```

## Development

### Building

```bash
# Build WASM module
npm run build:wasm

# Build JavaScript
npm run build:js

# Build everything
npm run build
```

### Testing

```bash
# Run JavaScript tests
npm test

# Run Rust tests
npm run test:rust

# Run all tests
npm test && npm run test:rust
```

### Development Server

```bash
npm run dev
```

This starts a development server at `http://localhost:9000` with the demo application.

### Linting and Formatting

```bash
# Lint TypeScript
npm run lint

# Format code
npm run format
```

## Performance

### Benchmarks

| Operation | Time | Memory |
|-----------|------|--------|
| WASM Module Load | ~50ms | ~2MB |
| String Matching (1000 words) | ~5ms | ~100KB |
| PDF Annotation | ~100ms | ~5MB |
| hOCR Processing | ~20ms | ~500KB |

### Optimization Tips

1. **Enable Caching**: Use `enableCaching: true` for repeated processing
2. **Batch Processing**: Process multiple pages together for better performance
3. **Appropriate Tolerance**: Higher tolerance values (0.8-0.9) are faster
4. **Memory Management**: Use `blob` output format for large documents

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## Node.js Support

The library works in Node.js 18+ environments:

```javascript
const { DocumentAnnotator } = require('document-annotator');
// or
import { DocumentAnnotator } from 'document-annotator';
```

## Error Handling

The library provides comprehensive error handling:

```typescript
try {
  const result = await annotator.annotatePage(query, pageObj);
  // Process result
} catch (error) {
  if (error.message.includes('WASM')) {
    console.error('WASM module error:', error);
  } else if (error.message.includes('fetch')) {
    console.error('Network error:', error);
  } else {
    console.error('Processing error:', error);
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test && npm run test:rust`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v0.1.0
- Initial WASM implementation
- Basic string matching and PDF annotation
- TypeScript support
- Demo application
- Test suite