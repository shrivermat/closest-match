// Main entry point for the document annotator library

export { DocumentAnnotator } from './document-annotator';
export { PDFAnnotator } from './pdf-annotator';
export { RichTextParser } from './rich-text-parser';
export { CacheManager } from './cache-manager';
export { CitationGenerator, type CitationData, type CitationResult } from './citation-generator';
export type {
  SearchQuery,
  PageObject,
  ProcessingOptions,
  MatchResult,
  AnnotatedPage,
  BoundingBox
} from './types';

// Export a default instance for convenience
import { DocumentAnnotator } from './document-annotator';
export const documentAnnotator = new DocumentAnnotator();

// Version info
export const VERSION = '0.1.0';