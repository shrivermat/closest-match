import { DocumentAnnotator } from '../src/document-annotator';
import type { SearchQuery, PageObject } from '../src/types';

// Mock the WASM module
jest.mock('../pkg/document_annotator', () => ({
  extract_embedded_text_from_hocr: jest.fn((text: string) => 
    '[[PARAGRAPH]] [[LINE 100 200 300 400]] hello world test'
  ),
  find_closest_match: jest.fn((text: string, query: string) => ({
    text: 'hello world',
    similarity: 0.95,
    start_index: 0,
    end_index: 2
  })),
  extract_bounding_box: jest.fn(() => ({
    x1: 100,
    y1: 200,
    x2: 300,
    y2: 400
  }))
}), { virtual: true });

// Mock PDFAnnotator
jest.mock('../src/pdf-annotator', () => ({
  PDFAnnotator: jest.fn().mockImplementation(() => ({
    createAnnotatedPdf: jest.fn().mockResolvedValue(new Blob(['mock pdf'], { type: 'application/pdf' })),
    validatePdf: jest.fn().mockResolvedValue({ isValid: true, pageCount: 1 }),
    extractPageInfo: jest.fn().mockResolvedValue({
      pageCount: 1,
      pages: [{ width: 612, height: 792, index: 0 }]
    })
  }))
}));

describe('DocumentAnnotator', () => {
  let annotator: DocumentAnnotator;

  beforeEach(() => {
    annotator = new DocumentAnnotator();
    
    // Mock fetch responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('.hocr') || url.includes('hocr')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<html><body>Mock hOCR content</body></html>')
        });
      } else if (url.includes('.pdf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('annotatePage', () => {
    it('should process a single page successfully', async () => {
      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      const result = await annotator.annotatePage('hello world', pageObj);

      expect(result).toBeDefined();
      expect(result.docUID).toBe('test-doc-123');
      expect(result.pageNumber).toBe(1);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].text).toBe('hello world');
      expect(result.matches[0].similarity).toBe(0.95);
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/invalid.hocr',
        pdfUrl: 'http://example.com/invalid.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      await expect(annotator.annotatePage('test', pageObj)).rejects.toThrow();
    });
  });

  describe('annotatePages', () => {
    it('should process multiple pages', async () => {
      const searchQueries: SearchQuery[] = [
        { text: 'hello world', annotationType: 'rectangle' }
      ];

      const pageObjects: PageObject[] = [
        {
          hocrUrl: 'http://example.com/page1.hocr',
          pdfUrl: 'http://example.com/page1.pdf',
          docUID: 'test-doc-123',
          pageNumber: 1
        },
        {
          hocrUrl: 'http://example.com/page2.hocr',
          pdfUrl: 'http://example.com/page2.pdf',
          docUID: 'test-doc-123',
          pageNumber: 2
        }
      ];

      const results = await annotator.annotatePages(searchQueries, pageObjects);

      expect(results).toHaveLength(2);
      expect(results[0].pageNumber).toBe(1);
      expect(results[1].pageNumber).toBe(2);
      expect(results[0].processingTime).toBeGreaterThan(0);
    });

    it('should continue processing even if one page fails', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('<html>hOCR content</html>')
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const searchQueries: SearchQuery[] = [
        { text: 'test', annotationType: 'rectangle' }
      ];

      const pageObjects: PageObject[] = [
        {
          hocrUrl: 'http://example.com/page1.hocr',
          pdfUrl: 'http://example.com/page1.pdf',
          docUID: 'doc1',
          pageNumber: 1
        },
        {
          hocrUrl: 'http://example.com/page2.hocr',
          pdfUrl: 'http://example.com/page2.pdf',
          docUID: 'doc2',
          pageNumber: 2
        }
      ];

      const results = await annotator.annotatePages(searchQueries, pageObjects);

      // Should get one successful result despite one failure
      expect(results).toHaveLength(1);
      expect(results[0].docUID).toBe('doc1');
    });
  });

  describe('testWasm', () => {
    it('should return true when WASM module is working', async () => {
      const result = await annotator.testWasm();
      expect(result).toBe(true);
    });
  });

  describe('annotatePageAdvanced', () => {
    it('should process page with multiple search queries and different annotation types', async () => {
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

      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      const result = await annotator.annotatePageAdvanced(searchQueries, pageObj);

      expect(result).toBeDefined();
      expect(result.docUID).toBe('test-doc-123');
      expect(result.matches).toHaveLength(2); // One for each search query
      expect(result.matches[0].annotationType).toBe('rectangle');
      expect(result.matches[1].annotationType).toBe('highlight');
    });
  });

  describe('annotatePagesWithProgress', () => {
    it('should process pages with progress callbacks', async () => {
      const searchQueries: SearchQuery[] = [
        { text: 'test query', annotationType: 'rectangle' }
      ];

      const pageObjects: PageObject[] = [
        {
          hocrUrl: 'http://example.com/page1.hocr',
          pdfUrl: 'http://example.com/page1.pdf',
          docUID: 'test-doc-123',
          pageNumber: 1
        },
        {
          hocrUrl: 'http://example.com/page2.hocr',
          pdfUrl: 'http://example.com/page2.pdf',
          docUID: 'test-doc-123',
          pageNumber: 2
        }
      ];

      const progressCalls: Array<{ completed: number; total: number }> = [];
      const onProgress = (completed: number, total: number, currentPage: PageObject) => {
        progressCalls.push({ completed, total });
      };

      const results = await annotator.annotatePagesWithProgress(
        searchQueries, 
        pageObjects, 
        undefined, 
        onProgress
      );

      expect(results).toHaveLength(2);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1].completed).toBe(2);
      expect(progressCalls[progressCalls.length - 1].total).toBe(2);
    });
  });

  describe('PDF utility methods', () => {
    it('should validate PDF', async () => {
      const pdfBytes = new ArrayBuffer(1024);
      const result = await annotator.validatePdf(pdfBytes);

      expect(result.isValid).toBe(true);
      expect(result.pageCount).toBe(1);
    });

    it('should extract page info', async () => {
      const pdfBytes = new ArrayBuffer(1024);
      const result = await annotator.extractPageInfo(pdfBytes);

      expect(result.pageCount).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toEqual({
        width: 612,
        height: 792,
        index: 0
      });
    });
  });

  describe('Rich text processing', () => {
    it('should process HTML formatted search query', async () => {
      const htmlQuery = '<strong style="color: red;">voltage regulator</strong>';
      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      const result = await annotator.annotatePageWithHTML(htmlQuery, pageObj);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].text).toBe('voltage regulator');
      expect(result.matches[0].formatting?.color).toBeDefined();
    });

    it('should process RTF formatted search query', async () => {
      const rtfQuery = '{\\rtf1\\ansi\\deff0 \\b voltage regulator}';
      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      const result = await annotator.annotatePageWithRTF(rtfQuery, pageObj);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].text).toBe('voltage regulator');
    });

    it('should auto-detect rich text format', async () => {
      const richTextQuery = '<u>circuit section</u>';
      const pageObj: PageObject = {
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      };

      const result = await annotator.annotatePageWithRichText(richTextQuery, pageObj);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].annotationType).toBe('underline');
    });

    it('should process multiple rich text queries', async () => {
      const richTextQueries = [
        '<strong>voltage regulator</strong>',
        '<span style="background-color: yellow;">circuit section</span>',
        '<s>deprecated feature</s>'
      ];
      
      const pageObjects: PageObject[] = [{
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      }];

      const results = await annotator.annotatePagesWithRichText(richTextQueries, pageObjects);

      expect(results).toHaveLength(1);
      expect(results[0].matches).toHaveLength(3); // One for each rich text query
    });

    it('should parse rich text queries without processing', () => {
      const richTextQueries = [
        '<strong>Bold text</strong>',
        'Plain text',
        '<span style="color: red;">Red text</span>'
      ];

      const result = annotator.parseRichTextQueries(richTextQueries);

      expect(result.plainTextQueries).toHaveLength(3);
      expect(result.searchQueries).toHaveLength(3);
      expect(result.formattingInfo).toHaveLength(3);
      expect(result.formattingInfo[0].hasFormatting).toBe(true);
      expect(result.formattingInfo[1].hasFormatting).toBe(false);
      expect(result.formattingInfo[2].hasFormatting).toBe(true);
    });

    it('should create HTML query with formatting', () => {
      const htmlQuery = DocumentAnnotator.createHTMLQuery('test text', {
        bold: true,
        color: 'red',
        backgroundColor: 'yellow',
        fontSize: 16
      });

      expect(htmlQuery).toContain('<strong>');
      expect(htmlQuery).toContain('color: red');
      expect(htmlQuery).toContain('background-color: yellow');
      expect(htmlQuery).toContain('font-size: 16px');
    });

    it('should deduplicate search queries', async () => {
      const richTextQueries = [
        'voltage regulator',
        'voltage regulator', // Duplicate
        '<strong>voltage regulator</strong>' // Different formatting
      ];
      
      const pageObjects: PageObject[] = [{
        hocrUrl: 'http://example.com/page1.hocr',
        pdfUrl: 'http://example.com/page1.pdf',
        docUID: 'test-doc-123',
        pageNumber: 1
      }];

      const results = await annotator.annotatePagesWithRichText(richTextQueries, pageObjects);

      // Should have 2 unique queries (plain and formatted), not 3
      expect(results[0].matches).toHaveLength(2);
    });
  });

  describe('Cache management', () => {
    it('should clear cache', async () => {
      await expect(annotator.clearCache()).resolves.not.toThrow();
    });

    it('should get cache stats', async () => {
      const mockStats = {
        stats: {
          totalProcessed: 10,
          averageProcessingTime: 100,
          cacheHitRate: 0.8,
          lastUpdated: Date.now()
        },
        info: {
          totalEntries: 5,
          totalSize: 1024,
          storeInfo: {
            hocr_data: { entries: 2, size: 512 },
            match_results: { entries: 3, size: 512 }
          }
        }
      };

      // Mock the cache manager methods
      const mockCacheManager = (annotator as any).cacheManager;
      mockCacheManager.getStats = jest.fn().mockResolvedValue(mockStats.stats);
      mockCacheManager.getCacheInfo = jest.fn().mockResolvedValue(mockStats.info);

      const result = await annotator.getCacheStats();

      expect(result).toEqual(mockStats);
    });

    it('should cleanup cache', async () => {
      const mockCacheManager = (annotator as any).cacheManager;
      mockCacheManager.cleanup = jest.fn().mockResolvedValue({ removed: 3, freedBytes: 1024 });

      const result = await annotator.cleanupCache();

      expect(result).toEqual({ removed: 3, freedBytes: 1024 });
    });

    it('should preload hOCR data', async () => {
      const pageObjects: PageObject[] = [
        {
          hocrUrl: 'http://example.com/page1.hocr',
          pdfUrl: 'http://example.com/page1.pdf',
          docUID: 'test-doc-123',
          pageNumber: 1
        },
        {
          hocrUrl: 'http://example.com/page2.hocr',
          pdfUrl: 'http://example.com/page2.pdf',
          docUID: 'test-doc-123',
          pageNumber: 2
        }
      ];

      await expect(annotator.preloadHocrData(pageObjects)).resolves.not.toThrow();
    });
  });
});