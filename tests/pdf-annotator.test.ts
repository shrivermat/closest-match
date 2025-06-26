import { PDFAnnotator } from '../src/pdf-annotator';
import type { MatchResult } from '../src/types';

// Mock PDF-lib
const mockPage = {
  getSize: jest.fn(() => ({ width: 612, height: 792 })),
  drawRectangle: jest.fn(),
  drawLine: jest.fn(),
  drawText: jest.fn(),
  doc: {
    embedFont: jest.fn(() => Promise.resolve({}))
  }
};

const mockPdfDoc = {
  getPages: jest.fn(() => [mockPage]),
  save: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3, 4, 5]))),
  load: jest.fn()
};

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    load: jest.fn(() => Promise.resolve(mockPdfDoc))
  },
  rgb: jest.fn((r, g, b) => ({ r, g, b })),
  StandardFonts: {
    Helvetica: 'Helvetica'
  }
}));

describe('PDFAnnotator', () => {
  let pdfAnnotator: PDFAnnotator;
  const mockPdfBytes = new ArrayBuffer(1024);

  beforeEach(() => {
    pdfAnnotator = new PDFAnnotator();
    jest.clearAllMocks();
  });

  describe('createAnnotatedPdf', () => {
    it('should create annotated PDF with rectangle annotations', async () => {
      const matches: MatchResult[] = [
        {
          text: 'voltage regulator',
          similarity: 0.95,
          boundingBox: [100, 200, 300, 250],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'voltage regulator',
          startIndex: 0,
          endIndex: 2,
          annotationType: 'rectangle',
          formatting: { color: '#ff0000' }
        }
      ];

      const result = await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'blob');

      expect(result).toBeInstanceOf(Blob);
      expect(mockPage.drawRectangle).toHaveBeenCalled();
      expect(mockPage.drawText).toHaveBeenCalled();
    });

    it('should create annotated PDF with highlight annotations', async () => {
      const matches: MatchResult[] = [
        {
          text: 'circuit section',
          similarity: 0.88,
          boundingBox: [150, 300, 400, 350],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'circuit section',
          startIndex: 5,
          endIndex: 7,
          annotationType: 'highlight',
          formatting: { backgroundColor: '#ffff00' }
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'arrayBuffer');

      expect(mockPage.drawRectangle).toHaveBeenCalledWith(
        expect.objectContaining({
          color: expect.any(Object),
          opacity: expect.any(Number)
        })
      );
    });

    it('should create annotated PDF with underline annotations', async () => {
      const matches: MatchResult[] = [
        {
          text: 'memory elements',
          similarity: 0.92,
          boundingBox: [200, 400, 350, 420],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'memory elements',
          startIndex: 10,
          endIndex: 12,
          annotationType: 'underline',
          formatting: { color: '#0000ff' }
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'base64');

      expect(mockPage.drawLine).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.any(Object),
          end: expect.any(Object),
          thickness: expect.any(Number),
          color: expect.any(Object)
        })
      );
    });

    it('should create annotated PDF with strikethrough annotations', async () => {
      const matches: MatchResult[] = [
        {
          text: 'deprecated feature',
          similarity: 0.85,
          boundingBox: [100, 500, 250, 520],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'deprecated feature',
          startIndex: 15,
          endIndex: 17,
          annotationType: 'strikethrough',
          formatting: { color: '#808080' }
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches);

      expect(mockPage.drawLine).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.objectContaining({ y: expect.any(Number) }),
          end: expect.objectContaining({ y: expect.any(Number) }),
          thickness: expect.any(Number)
        })
      );
    });

    it('should handle multiple annotation types on same page', async () => {
      const matches: MatchResult[] = [
        {
          text: 'first match',
          similarity: 0.95,
          boundingBox: [100, 200, 200, 220],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'first match',
          startIndex: 0,
          endIndex: 2,
          annotationType: 'rectangle'
        },
        {
          text: 'second match',
          similarity: 0.88,
          boundingBox: [250, 300, 350, 320],
          pageNumber: 1,
          docUID: 'test-doc',
          searchQuery: 'second match',
          startIndex: 3,
          endIndex: 5,
          annotationType: 'highlight'
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches);

      expect(mockPage.drawRectangle).toHaveBeenCalledTimes(2);
      expect(mockPage.drawText).toHaveBeenCalledTimes(2);
    });

    it('should handle different output formats', async () => {
      const matches: MatchResult[] = [
        {
          text: 'test',
          similarity: 0.9,
          boundingBox: [0, 0, 100, 20],
          pageNumber: 1,
          docUID: 'test',
          searchQuery: 'test',
          startIndex: 0,
          endIndex: 1,
          annotationType: 'rectangle'
        }
      ];

      // Test blob output
      const blobResult = await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'blob');
      expect(blobResult).toBeInstanceOf(Blob);

      // Test base64 output
      const base64Result = await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'base64');
      expect(typeof base64Result).toBe('string');

      // Test arrayBuffer output
      const arrayBufferResult = await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches, 'arrayBuffer');
      expect(arrayBufferResult).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('validatePdf', () => {
    it('should validate a valid PDF', async () => {
      const result = await pdfAnnotator.validatePdf(mockPdfBytes);

      expect(result.isValid).toBe(true);
      expect(result.pageCount).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should handle invalid PDF', async () => {
      const { PDFDocument } = require('pdf-lib');
      PDFDocument.load.mockRejectedValueOnce(new Error('Invalid PDF'));

      const result = await pdfAnnotator.validatePdf(mockPdfBytes);

      expect(result.isValid).toBe(false);
      expect(result.pageCount).toBe(0);
      expect(result.error).toBe('Invalid PDF');
    });
  });

  describe('extractPageInfo', () => {
    it('should extract page information', async () => {
      const result = await pdfAnnotator.extractPageInfo(mockPdfBytes);

      expect(result.pageCount).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toEqual({
        width: 612,
        height: 792,
        index: 0
      });
    });
  });

  describe('color parsing', () => {
    it('should parse hex colors correctly', async () => {
      const matches: MatchResult[] = [
        {
          text: 'red text',
          similarity: 0.9,
          boundingBox: [0, 0, 100, 20],
          pageNumber: 1,
          docUID: 'test',
          searchQuery: 'red text',
          startIndex: 0,
          endIndex: 2,
          annotationType: 'rectangle',
          formatting: { color: '#ff0000' }
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches);

      expect(mockPage.drawRectangle).toHaveBeenCalledWith(
        expect.objectContaining({
          borderColor: { r: 1, g: 0, b: 0 }
        })
      );
    });

    it('should parse named colors correctly', async () => {
      const matches: MatchResult[] = [
        {
          text: 'blue text',
          similarity: 0.9,
          boundingBox: [0, 0, 100, 20],
          pageNumber: 1,
          docUID: 'test',
          searchQuery: 'blue text',
          startIndex: 0,
          endIndex: 2,
          annotationType: 'rectangle',
          formatting: { color: 'blue' }
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches);

      expect(mockPage.drawRectangle).toHaveBeenCalledWith(
        expect.objectContaining({
          borderColor: { r: 0, g: 0, b: 1 }
        })
      );
    });
  });

  describe('coordinate transformation', () => {
    it('should transform hOCR coordinates to PDF coordinates', async () => {
      const matches: MatchResult[] = [
        {
          text: 'test text',
          similarity: 0.9,
          boundingBox: [100, 200, 300, 250], // hOCR coordinates
          pageNumber: 1,
          docUID: 'test',
          searchQuery: 'test text',
          startIndex: 0,
          endIndex: 2,
          annotationType: 'rectangle'
        }
      ];

      await pdfAnnotator.createAnnotatedPdf(mockPdfBytes, matches);

      // Verify that coordinates were transformed
      const drawCall = mockPage.drawRectangle.mock.calls[0][0];
      expect(drawCall.x).toBeGreaterThanOrEqual(0);
      expect(drawCall.y).toBeGreaterThanOrEqual(0);
      expect(drawCall.width).toBeGreaterThan(0);
      expect(drawCall.height).toBeGreaterThan(0);
    });
  });
});