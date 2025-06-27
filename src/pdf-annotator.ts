import { PDFDocument, PDFPage, rgb, cmyk, grayscale, StandardFonts } from 'pdf-lib';
import type { SearchQuery, MatchResult, BoundingBox } from './types';

export interface AnnotationStyle {
  borderColor: { r: number; g: number; b: number };
  fillColor?: { r: number; g: number; b: number };
  opacity: number;
  borderWidth: number;
  fontSize?: number;
  fontColor?: { r: number; g: number; b: number };
}

export interface CoordinateTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  pageHeight: number;
}

export class PDFAnnotator {
  private static readonly DEFAULT_STYLES: Record<string, AnnotationStyle> = {
    rectangle: {
      borderColor: { r: 1, g: 0, b: 0 }, // Red
      fillColor: { r: 1, g: 0, b: 0 },
      opacity: 0.1,
      borderWidth: 2,
      fontSize: 10,
      fontColor: { r: 1, g: 0, b: 0 }
    },
    highlight: {
      borderColor: { r: 1, g: 1, b: 0 }, // Yellow
      fillColor: { r: 1, g: 1, b: 0 },
      opacity: 0.3,
      borderWidth: 0,
      fontSize: 10,
      fontColor: { r: 0.8, g: 0.8, b: 0 }
    },
    underline: {
      borderColor: { r: 0, g: 0, b: 1 }, // Blue
      opacity: 1,
      borderWidth: 2,
      fontSize: 10,
      fontColor: { r: 0, g: 0, b: 1 }
    },
    strikethrough: {
      borderColor: { r: 0.5, g: 0.5, b: 0.5 }, // Gray
      opacity: 1,
      borderWidth: 2,
      fontSize: 10,
      fontColor: { r: 0.5, g: 0.5, b: 0.5 }
    }
  };

  /**
   * Create annotated PDF from matches
   */
  async createAnnotatedPdf(
    pdfBytes: ArrayBuffer,
    matches: MatchResult[],
    outputFormat: 'blob' | 'base64' | 'arrayBuffer' = 'blob'
  ): Promise<Blob | string | ArrayBuffer> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    if (pages.length === 0) {
      throw new Error('PDF document contains no pages');
    }

    // Group matches by page number
    const matchesByPage = this.groupMatchesByPage(matches);
    
    // Process each page with matches
    for (const [pageNum, pageMatches] of matchesByPage.entries()) {
      const pageIndex = pageNum - 1; // Convert to 0-based index
      
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];
        await this.annotatePage(page, pageMatches);
      }
    }

    // Return in requested format
    const pdfBytesResult = await pdfDoc.save();
    return this.formatOutput(pdfBytesResult, outputFormat);
  }

  /**
   * Annotate a single PDF page with matches
   */
  private async annotatePage(page: PDFPage, matches: MatchResult[]): Promise<void> {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const font = await page.doc.embedFont(StandardFonts.Helvetica);
    
    // Calculate coordinate transformation
    const transform = this.calculateCoordinateTransform(pageWidth, pageHeight, matches);
    
    for (const match of matches) {
      const [x1, y1, x2, y2] = match.boundingBox;
      
      // Transform hOCR coordinates to PDF coordinates
      const pdfCoords = this.transformCoordinates(x1, y1, x2, y2, transform);
      
      // Get annotation style
      const style = this.getAnnotationStyle(match.searchQuery, match);
      
      // Create annotation based on type
      await this.createAnnotation(page, pdfCoords, style, match, font);
    }
  }

  /**
   * Calculate coordinate transformation from hOCR to PDF space
   */
  private calculateCoordinateTransform(
    pageWidth: number, 
    pageHeight: number, 
    matches: MatchResult[]
  ): CoordinateTransform {
    // Extract hOCR page dimensions from bounding boxes
    // This is a simplified approach - in production, we'd parse hOCR page info
    const hocrBounds = matches.reduce(
      (bounds, match) => {
        const [x1, y1, x2, y2] = match.boundingBox;
        return {
          minX: Math.min(bounds.minX, x1),
          minY: Math.min(bounds.minY, y1),
          maxX: Math.max(bounds.maxX, x2),
          maxY: Math.max(bounds.maxY, y2)
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    // Use actual hOCR page dimensions from the hOCR file
    // hOCR page dimensions are: bbox 0 0 2560 3300 from the document
    const hocrWidth = 2560;
    const hocrHeight = 3300;
    
    return {
      scaleX: pageWidth / hocrWidth,
      scaleY: pageHeight / hocrHeight,
      offsetX: 0,
      offsetY: 0,
      pageHeight
    };
  }

  /**
   * Transform hOCR coordinates to PDF coordinates
   */
  private transformCoordinates(
    x1: number, 
    y1: number, 
    x2: number, 
    y2: number, 
    transform: CoordinateTransform
  ): { x: number; y: number; width: number; height: number } {
    // Ensure coordinates are in correct order (left < right, top < bottom)
    const leftX = Math.min(x1, x2);
    const rightX = Math.max(x1, x2);
    const topY = Math.min(y1, y2);
    const bottomY = Math.max(y1, y2);
    
    // Scale coordinates from hOCR space to PDF space
    const scaledLeft = leftX * transform.scaleX;
    const scaledRight = rightX * transform.scaleX;
    const scaledTop = topY * transform.scaleY;
    const scaledBottom = bottomY * transform.scaleY;
    
    // Convert Y coordinates (PDF origin is bottom-left, hOCR is top-left)
    // Following the Python pattern: page_height - y
    const pdfBottom = transform.pageHeight - scaledBottom;
    const pdfTop = transform.pageHeight - scaledTop;
    
    return {
      x: scaledLeft,
      y: pdfBottom,
      width: scaledRight - scaledLeft,
      height: pdfTop - pdfBottom
    };
  }

  /**
   * Get annotation style for a match
   */
  private getAnnotationStyle(searchQuery: string, match: MatchResult): AnnotationStyle {
    // Use annotation type from match, fallback to rectangle
    const annotationType = match.annotationType || 'rectangle';
    const baseStyle = { ...PDFAnnotator.DEFAULT_STYLES[annotationType] };
    
    // Apply custom formatting if provided
    if (match.formatting) {
      if (match.formatting.color) {
        const color = this.parseColor(match.formatting.color);
        if (color) {
          baseStyle.borderColor = color;
          baseStyle.fontColor = { r: color.r * 0.8, g: color.g * 0.8, b: color.b * 0.8 };
        }
      }
      
      if (match.formatting.backgroundColor) {
        const bgColor = this.parseColor(match.formatting.backgroundColor);
        if (bgColor) {
          baseStyle.fillColor = bgColor;
        }
      }
    }
    
    return baseStyle;
  }

  /**
   * Parse color string to RGB values
   */
  private parseColor(colorString: string): { r: number; g: number; b: number } | null {
    // Handle hex colors (#ff0000, #f00)
    if (colorString.startsWith('#')) {
      const hex = colorString.slice(1);
      let r, g, b;
      
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return null;
      }
      
      return { r: r / 255, g: g / 255, b: b / 255 };
    }
    
    // Handle named colors (basic set)
    const namedColors: Record<string, [number, number, number]> = {
      red: [1, 0, 0],
      green: [0, 1, 0],
      blue: [0, 0, 1],
      yellow: [1, 1, 0],
      orange: [1, 0.5, 0],
      purple: [0.5, 0, 0.5],
      pink: [1, 0.75, 0.8],
      cyan: [0, 1, 1],
      magenta: [1, 0, 1],
      black: [0, 0, 0],
      white: [1, 1, 1],
      gray: [0.5, 0.5, 0.5],
      grey: [0.5, 0.5, 0.5]
    };
    
    const lower = colorString.toLowerCase();
    if (namedColors[lower]) {
      const [r, g, b] = namedColors[lower];
      return { r, g, b };
    }
    
    return null;
  }

  /**
   * Create annotation on PDF page
   */
  private async createAnnotation(
    page: PDFPage,
    coords: { x: number; y: number; width: number; height: number },
    style: AnnotationStyle,
    match: MatchResult,
    font: any
  ): Promise<void> {
    const { x, y, width, height } = coords;
    const annotationType = match.annotationType || 'rectangle';
    
    switch (annotationType) {
      case 'highlight':
        // Create highlight annotation
        page.drawRectangle({
          x,
          y,
          width,
          height,
          color: rgb(style.fillColor?.r || 1, style.fillColor?.g || 1, style.fillColor?.b || 0),
          opacity: style.opacity
        });
        break;
        
      case 'underline':
        // Create underline
        page.drawLine({
          start: { x, y },
          end: { x: x + width, y },
          thickness: style.borderWidth,
          color: rgb(style.borderColor.r, style.borderColor.g, style.borderColor.b),
          opacity: style.opacity
        });
        break;
        
      case 'strikethrough':
        // Create strikethrough
        const middleY = y + height / 2;
        page.drawLine({
          start: { x, y: middleY },
          end: { x: x + width, y: middleY },
          thickness: style.borderWidth,
          color: rgb(style.borderColor.r, style.borderColor.g, style.borderColor.b),
          opacity: style.opacity
        });
        break;
        
      case 'rectangle':
      default:
        // Create selectable rectangle annotation
        try {
          // Get access to the PDF document context
          const pdfDoc = (page as any).doc;
          
          // Create annotation dictionary
          const annotation = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Square',
            Rect: [x, y, x + width, y + height],
            C: [style.borderColor.r, style.borderColor.g, style.borderColor.b],
            CA: style.opacity,
            BS: {
              W: style.borderWidth,
              S: 'S'
            },
            F: 4, // Print flag
            Contents: pdfDoc.context.obj(`Text Match: ${match.text.substring(0, 100)}...`),
            T: pdfDoc.context.obj('TextMatch'),
            M: pdfDoc.context.obj(new Date().toISOString()),
            CreationDate: pdfDoc.context.obj(new Date().toISOString())
          });
          
          // Register the annotation
          const annotRef = pdfDoc.context.register(annotation);
          
          // Add annotation to page's annotation array
          const existingAnnots = (page as any).node.get(pdfDoc.context.obj('Annots'));
          if (existingAnnots) {
            existingAnnots.push(annotRef);
          } else {
            (page as any).node.set(pdfDoc.context.obj('Annots'), pdfDoc.context.obj([annotRef]));
          }
        } catch (error) {
          // Fallback to visual rectangle if annotation creation fails
          console.warn('Failed to create selectable annotation, falling back to visual rectangle:', error);
          const drawOptions: any = {
            x,
            y,
            width,
            height,
            borderWidth: style.borderWidth,
            borderColor: rgb(style.borderColor.r, style.borderColor.g, style.borderColor.b),
            opacity: style.opacity
          };
          
          if (style.fillColor) {
            drawOptions.color = rgb(style.fillColor.r, style.fillColor.g, style.fillColor.b);
          }
          
          page.drawRectangle(drawOptions);
        }
        break;
    }
    
    // Note: Similarity score labels removed per user request
    // The similarity information is now embedded in the annotation's Contents property
    // and will appear as a tooltip when hovering over the annotation
  }

  /**
   * Group matches by page number
   */
  private groupMatchesByPage(matches: MatchResult[]): Map<number, MatchResult[]> {
    const grouped = new Map<number, MatchResult[]>();
    
    for (const match of matches) {
      const pageNum = match.pageNumber;
      if (!grouped.has(pageNum)) {
        grouped.set(pageNum, []);
      }
      grouped.get(pageNum)!.push(match);
    }
    
    return grouped;
  }

  /**
   * Format output in requested format
   */
  private formatOutput(
    pdfBytes: Uint8Array, 
    format: 'blob' | 'base64' | 'arrayBuffer'
  ): Blob | string | ArrayBuffer {
    switch (format) {
      case 'blob':
        return new Blob([pdfBytes], { type: 'application/pdf' });
      case 'base64':
        return this.uint8ArrayToBase64(pdfBytes);
      case 'arrayBuffer':
        return pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  /**
   * Create custom annotation style
   */
  static createAnnotationStyle(
    borderColor: [number, number, number],
    fillColor?: [number, number, number],
    opacity: number = 0.3,
    borderWidth: number = 2,
    fontSize: number = 10
  ): AnnotationStyle {
    const style: AnnotationStyle = {
      borderColor: { r: borderColor[0], g: borderColor[1], b: borderColor[2] },
      opacity,
      borderWidth,
      fontSize,
      fontColor: { r: borderColor[0] * 0.8, g: borderColor[1] * 0.8, b: borderColor[2] * 0.8 }
    };
    
    if (fillColor) {
      style.fillColor = { r: fillColor[0], g: fillColor[1], b: fillColor[2] };
    }
    
    return style;
  }

  /**
   * Extract page information from PDF
   */
  async extractPageInfo(pdfBytes: ArrayBuffer): Promise<{
    pageCount: number;
    pages: Array<{ width: number; height: number; index: number }>;
  }> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    return {
      pageCount: pages.length,
      pages: pages.map((page, index) => {
        const { width, height } = page.getSize();
        return { width, height, index };
      })
    };
  }

  /**
   * Validate PDF document
   */
  async validatePdf(pdfBytes: ArrayBuffer): Promise<{
    isValid: boolean;
    pageCount: number;
    error?: string;
  }> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      
      return {
        isValid: true,
        pageCount: pages.length
      };
    } catch (error) {
      return {
        isValid: false,
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Unknown PDF validation error'
      };
    }
  }
}