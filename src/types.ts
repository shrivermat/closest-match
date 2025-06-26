// TypeScript type definitions for the document annotator

export interface SearchQuery {
  text: string;
  formatting?: {
    color?: string;
    backgroundColor?: string;
    decorations?: ('underline' | 'strikethrough')[];
  };
  annotationType: 'rectangle' | 'highlight' | 'underline' | 'strikethrough';
}

export interface PageObject {
  hocrUrl: string;
  pdfUrl: string;
  docUID: string;
  pageNumber: number;
  metadata?: Record<string, any>;
}

export interface ProcessingOptions {
  tolerance: number;           // 0.0 - 1.0, matching tolerance
  maxResults: number;          // Maximum results per page
  enableCaching: boolean;      // Use IndexedDB caching
  outputFormat: 'blob' | 'base64' | 'arrayBuffer';
  parallelProcessing: boolean; // Use Web Workers
}

export interface MatchResult {
  text: string;
  similarity: number;
  boundingBox: [number, number, number, number];
  pageNumber: number;
  docUID: string;
  searchQuery: string;
  startIndex: number;
  endIndex: number;
  annotationType?: 'rectangle' | 'highlight' | 'underline' | 'strikethrough';
  formatting?: {
    color?: string;
    backgroundColor?: string;
    decorations?: ('underline' | 'strikethrough')[];
  };
}

export interface AnnotatedPage {
  docUID: string;
  pageNumber: number;
  pdfData: Blob | string | ArrayBuffer;
  matches: MatchResult[];
  processingTime: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// WASM module types
export interface WasmMatchResult {
  text: string;
  similarity: number;
  start_index: number;
  end_index: number;
}

export interface WasmBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}