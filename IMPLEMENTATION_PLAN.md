# Document Annotation WASM Implementation Plan

## Project Overview

This project transforms a Python-based OCR text matching and PDF annotation system into a modern WebAssembly (WASM) solution. The system finds text matches in hOCR files and automatically generates annotated PDF documents with visual callouts.

### Core Objectives
- Convert Python string matching algorithms to WASM for browser/Node.js compatibility
- Eliminate file system dependencies using memory streams and URL-based resources
- Enable batch processing of multiple search queries across document pages
- Support rich text formatting (HTML/RTF) for advanced search capabilities
- Integrate citation generation for legal document processing

## Current Status: Planning Phase ✅

### Python Reference Implementation Analysis
The existing Python implementation provides excellent string matching accuracy with these key components:
- `closest_match.py:sequence_similarity()` - Character-by-character comparison with length normalization
- Sliding window algorithm for finding best matches in cleaned OCR text
- Coordinate extraction from hOCR LINE markers for precise bounding box calculation
- PDF annotation using PyPDF2 with coordinate transformation

**Note**: The Python implementation's string matching algorithm is highly effective and should be referenced if accuracy issues arise during WASM implementation.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Search API    │────│   WASM Core      │────│  PDF Annotator  │
│  (JavaScript)   │    │ (Rust/C++)       │    │  (PDF-lib)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   hOCR Parser   │    │ String Matching  │    │ Citation Gen    │
│   (hocrjs)      │    │   Algorithm      │    │ (unitedstates)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Implementation Phases

### Phase 1: Foundation Setup (Weeks 1-2)
**Status**: ✅ Completed  
**Assignee**: Claude  
**Priority**: Critical

#### Milestones
- [x] **1.1 Project Structure Setup**
  - Initialize Rust WASM project with wasm-pack
  - Configure JavaScript/TypeScript environment
  - Set up build pipeline and testing framework
  - Create development and production configurations

- [x] **1.2 Core String Matching in WASM**
  - Port `sequence_similarity()` function to Rust
  - Implement sliding window algorithm from Python reference
  - Add text cleaning functionality (remove hOCR markers)
  - Create WASM bindings for JavaScript integration
  - **Validation**: Match accuracy should equal Python implementation

- [x] **1.3 Basic JavaScript Integration**
  - Create JavaScript wrapper for WASM module
  - Implement memory management for large text processing
  - Add error handling and logging
  - Write unit tests for string matching functions

#### Deliverables
- ✅ Functional WASM module with string matching
- ✅ JavaScript API wrapper
- ✅ Test suite with accuracy validation
- ✅ Basic documentation

### Phase 2: Document Processing (Weeks 3-4)
**Status**: ✅ Completed  
**Assignee**: Claude  
**Priority**: Critical

#### Milestones
- [x] **2.1 hOCR Processing**
  - Integrate hocrjs library for hOCR parsing
  - Implement coordinate extraction from LINE markers
  - Port bounding box calculation logic from `extract_box.py`
  - Add support for URL-based hOCR file loading

- [x] **2.2 PDF Annotation Engine**
  - Integrate PDF-lib for PDF manipulation
  - Implement rectangle annotation creation
  - Add coordinate transformation (hOCR → PDF space)
  - Support multiple annotation types (rectangle, highlight, underline, strikethrough)

- [x] **2.3 Memory Stream Processing**
  - Replace file I/O with memory streams
  - Implement URL-based resource loading
  - Add caching layer using IndexedDB
  - Optimize memory usage for large documents

#### Deliverables
- ✅ Complete document processing pipeline
- ✅ PDF annotation capabilities with 4 annotation types
- ✅ Memory-efficient processing
- ✅ Integration tests and comprehensive test suite

### Phase 3: API Development (Weeks 5-6)
**Status**: ✅ Completed  
**Assignee**: Claude  
**Priority**: High

#### Milestones
- [x] **3.1 Core API Implementation**
  ```typescript
  interface DocumentAnnotator {
    annotatePages(
      searchQueries: SearchQuery[],
      pageObjects: PageObject[],
      options: ProcessingOptions
    ): Promise<AnnotatedPage[]>;
  }
  ```

- [x] **3.2 Multi-Query Processing**
  - Support batch processing of multiple search terms
  - Implement caching with IndexedDB
  - Add progress tracking and cancellation support
  - Optimize for concurrent operations

- [x] **3.3 Rich Text Search Implementation**
  - Complete HTML parsing for formatted search queries
  - RTF parsing support
  - Auto-detection of text format
  - Color and formatting attribute extraction
  - Annotation styling based on search formatting

#### Deliverables
- ✅ Complete API specification with rich text support
- ✅ Multi-query processing capabilities
- ✅ Full rich text search (HTML, RTF, auto-detect)
- ✅ IndexedDB caching system
- ✅ Performance benchmarks and comprehensive test coverage

### Phase 4: Advanced Features (Weeks 7-8)
**Status**: 🔲 Not Started  
**Assignee**: TBD  
**Priority**: Medium

#### Milestones
- [ ] **4.1 Advanced Text Formatting**
  - RTF support for complex formatting
  - Support for underline, strikethrough annotations
  - Custom color and styling options
  - Text highlighting with transparency

- [ ] **4.2 Citation Integration**
  - Integrate unitedstates/citation library
  - Automatic legal citation detection
  - Bluebook citation generation
  - Document metadata extraction

- [ ] **4.3 Performance Optimization**
  - Implement advanced caching strategies
  - Add lazy loading for large document sets
  - Optimize WASM module size
  - Add performance monitoring

#### Deliverables
- Advanced annotation features
- Citation generation system
- Optimized performance
- Complete feature set

### Phase 5: Production Readiness (Weeks 9-10)
**Status**: 🔲 Not Started  
**Assignee**: TBD  
**Priority**: Medium

#### Milestones
- [ ] **5.1 Cross-Platform Testing**
  - Browser compatibility testing (Chrome, Firefox, Safari, Edge)
  - Node.js environment testing
  - Mobile browser testing
  - Performance testing across platforms

- [ ] **5.2 Error Handling & Monitoring**
  - Comprehensive error handling
  - Logging and monitoring integration
  - Graceful degradation for unsupported features
  - User-friendly error messages

- [ ] **5.3 Documentation & Examples**
  - Complete API documentation
  - Usage examples and tutorials
  - Integration guides for different frameworks
  - Troubleshooting guide

#### Deliverables
- Production-ready system
- Complete documentation
- Example applications
- Deployment guides

## Technical Specifications

### API Design

```typescript
// Core Types
interface SearchQuery {
  text: string;
  formatting?: {
    color?: string;
    backgroundColor?: string;
    decorations?: ('underline' | 'strikethrough')[];
  };
  annotationType: 'rectangle' | 'highlight' | 'underline' | 'strikethrough';
}

interface PageObject {
  hocrUrl: string;
  pdfUrl: string;
  docUID: string;
  pageNumber: number;
  metadata?: Record<string, any>;
}

interface ProcessingOptions {
  tolerance: number;           // 0.0 - 1.0, matching tolerance
  maxResults: number;          // Maximum results per page
  enableCaching: boolean;      // Use IndexedDB caching
  outputFormat: 'blob' | 'base64' | 'arrayBuffer';
  parallelProcessing: boolean; // Use Web Workers
}

interface MatchResult {
  text: string;
  similarity: number;
  boundingBox: [number, number, number, number];
  pageNumber: number;
  docUID: string;
}

interface AnnotatedPage {
  docUID: string;
  pageNumber: number;
  pdfData: Blob | string | ArrayBuffer;
  matches: MatchResult[];
  processingTime: number;
}
```

### Performance Targets

| Metric | Target | Critical Path |
|--------|---------|---------------|
| Processing Speed | <500ms per page | WASM string matching |
| Memory Usage | <100MB per PDF | Memory stream processing |
| Bundle Size | <5MB total | WASM + dependencies |
| Accuracy | >95% match rate | Algorithm optimization |
| Browser Support | Chrome 80+, Firefox 75+, Safari 14+ | WASM compatibility |

### Dependencies

```json
{
  "core": {
    "wasm-pack": "Build tool for Rust WASM",
    "pdf-lib": "PDF manipulation",
    "hocrjs": "hOCR parsing"
  },
  "optional": {
    "unitedstates/citation": "Legal citation extraction",
    "web-workers": "Parallel processing"
  },
  "development": {
    "jest": "Testing framework",
    "typescript": "Type safety",
    "webpack": "Bundling"
  }
}
```

## Risk Assessment & Mitigation

### High Risk Items
1. **WASM String Matching Accuracy**
   - *Risk*: Lower accuracy than Python implementation
   - *Mitigation*: Extensive testing against Python baseline, fallback options

2. **Memory Management**
   - *Risk*: Browser memory limits with large PDFs
   - *Mitigation*: Streaming processing, chunked operations

3. **Cross-Origin Resource Loading**
   - *Risk*: CORS issues with hOCR/PDF URLs
   - *Mitigation*: Proxy server options, CORS configuration guide

### Medium Risk Items
1. **Browser Compatibility**
   - *Risk*: WASM not supported in older browsers
   - *Mitigation*: Polyfills, fallback implementations

2. **Bundle Size**
   - *Risk*: Large bundle affects loading times
   - *Mitigation*: Code splitting, lazy loading, compression

## Development Guidelines

### Code Quality Standards
- TypeScript for type safety
- Unit test coverage >90%
- ESLint + Prettier for consistent formatting
- Comprehensive error handling
- Performance benchmarking for critical paths

### Git Workflow
- Feature branches for each milestone
- Code review required for all changes
- Automated testing in CI/CD
- Tagged releases for each phase completion

### Documentation Requirements
- API documentation with examples
- Inline code comments for complex algorithms
- Performance benchmarks and comparisons
- Migration guide from Python implementation

## Future Considerations

### Potential Enhancements
- Machine learning integration for improved matching
- Support for additional document formats (DOCX, RTF)
- Real-time collaborative annotation
- Integration with legal research platforms
- Mobile app development using same WASM core

### Scalability Planning
- Serverless deployment options
- CDN distribution for WASM modules
- Horizontal scaling for batch processing
- Integration with document management systems

---

## Project Status Updates

### Latest Update: 2024-12-25
- **Phase**: Phase 2 Complete, Phase 3 Ready to Start
- **Next Milestone**: Phase 3.1 - Advanced API Features
- **Blockers**: None
- **Notes**: 
  - ✅ Complete WASM foundation implemented with Rust
  - ✅ Full PDF annotation system with PDF-lib integration
  - ✅ 4 annotation types: rectangle, highlight, underline, strikethrough
  - ✅ Custom color and formatting support
  - ✅ Coordinate transformation system
  - ✅ Comprehensive test coverage
  - 🎯 Ready for advanced features and optimization

### Completed in Phase 1:
- Rust WASM module with string matching algorithms
- TypeScript API wrapper with full type definitions
- Comprehensive test suite with mocking
- Build pipeline (webpack, wasm-pack, jest)
- Demo HTML application
- Complete project documentation

### Completed in Phase 2:
- **PDFAnnotator**: Dedicated PDF processing module
- **Multiple annotation types**: Rectangle, highlight, underline, strikethrough
- **Color parsing**: Hex colors (#ff0000) and named colors (red, blue, etc.)
- **Coordinate transformation**: hOCR to PDF coordinate space conversion
- **Advanced API methods**: `annotatePageAdvanced()`, `annotatePagesWithProgress()`
- **PDF utilities**: `validatePdf()`, `extractPageInfo()`
- **Enhanced demo**: Updated with color pickers and annotation type selection
- **Comprehensive tests**: 25+ test cases covering all functionality

### Completed in Phase 3:
- **CacheManager**: Complete IndexedDB caching system with statistics
- **RichTextParser**: HTML and RTF parsing with auto-detection
- **Rich text methods**: `annotatePageWithHTML()`, `annotatePageWithRTF()`, `annotatePageWithRichText()`
- **Batch rich text processing**: `annotatePagesWithRichText()` with deduplication
- **Cache integration**: Automatic caching of hOCR data and match results
- **Cache utilities**: `clearCache()`, `getCacheStats()`, `cleanupCache()`, `preloadHocrData()`
- **Query parsing utilities**: `parseRichTextQueries()`, `createHTMLQuery()`
- **Enhanced demo**: Rich text input with format selection and examples
- **Comprehensive tests**: 40+ test cases covering caching and rich text functionality

---

*This document is a living plan and should be updated as milestones are completed and requirements evolve.*