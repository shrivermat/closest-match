/**
 * PDF Annotator - Pure JavaScript Implementation
 * Uses pdf-lib.js for client-side PDF manipulation
 * Ported from Python annotate_pdf.py concepts
 */

import { PDFDocument, rgb, degrees } from 'pdf-lib';

export class PDFAnnotator {
    constructor(options = {}) {
        this.defaultAnnotationColor = options.color || rgb(1, 0, 0); // Red
        this.defaultAnnotationOpacity = options.opacity || 0.3;
        this.borderWidth = options.borderWidth || 2;
    }
    
    /**
     * Add rectangle annotation to PDF at specified coordinates
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {Object} boundingBox - Coordinates {x1, y1, x2, y2}
     * @param {number} pageNumber - Page number (0-indexed)
     * @param {Object} options - Annotation options
     * @returns {Promise<Uint8Array>} Modified PDF bytes
     */
    async addAnnotation(pdfBytes, boundingBox, pageNumber = 0, options = {}) {
        if (!pdfBytes || !boundingBox) {
            throw new Error('PDF bytes and bounding box are required');
        }
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        
        if (pageNumber >= pages.length) {
            throw new Error(`Page ${pageNumber} does not exist. PDF has ${pages.length} pages.`);
        }
        
        const page = pages[pageNumber];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        // Transform coordinates from hOCR space to PDF space
        const pdfCoords = this.transformCoordinates(
            boundingBox, 
            { width: 2560, height: 3300 }, // Default hOCR page size
            { width: pageWidth, height: pageHeight },
            options.hocrPageSize
        );
        
        // Set annotation properties
        const color = options.color || this.defaultAnnotationColor;
        const opacity = options.opacity || this.defaultAnnotationOpacity;
        const borderWidth = options.borderWidth || this.borderWidth;
        
        // Draw rectangle annotation
        page.drawRectangle({
            x: pdfCoords.x,
            y: pdfCoords.y,
            width: pdfCoords.width,
            height: pdfCoords.height,
            borderColor: color,
            borderWidth: borderWidth,
            opacity: opacity
        });
        
        // Optionally add text label
        if (options.label) {
            this._addTextLabel(page, pdfCoords, options.label, options);
        }
        
        // Save and return the PDF
        return await pdfDoc.save();
    }
    
    /**
     * Transform coordinates from hOCR coordinate space to PDF coordinate space
     * @param {Object} hocrBbox - hOCR bounding box {x1, y1, x2, y2}
     * @param {Object} hocrPageSize - hOCR page dimensions
     * @param {Object} pdfPageSize - PDF page dimensions  
     * @param {Object} customHocrSize - Custom hOCR size if different
     * @returns {Object} PDF coordinates {x, y, width, height}
     */
    transformCoordinates(hocrBbox, hocrPageSize, pdfPageSize, customHocrSize = null) {
        // Use custom hOCR size if provided, otherwise use default
        const hocrSize = customHocrSize || hocrPageSize;
        
        // Calculate scaling factors
        const scaleX = pdfPageSize.width / hocrSize.width;
        const scaleY = pdfPageSize.height / hocrSize.height;
        
        // hOCR uses top-left origin (0,0), PDF uses bottom-left origin
        // Transform coordinates
        const x = hocrBbox.x1 * scaleX;
        const width = (hocrBbox.x2 - hocrBbox.x1) * scaleX;
        
        // Flip Y coordinate for PDF coordinate system
        const y = pdfPageSize.height - (hocrBbox.y2 * scaleY);
        const height = (hocrBbox.y2 - hocrBbox.y1) * scaleY;
        
        return { x, y, width, height };
    }
    
    /**
     * Add multiple annotations to PDF
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {Array} annotations - Array of annotation objects
     * @returns {Promise<Uint8Array>} Modified PDF bytes
     */
    async addMultipleAnnotations(pdfBytes, annotations) {
        let currentPdfBytes = pdfBytes;
        
        for (const annotation of annotations) {
            currentPdfBytes = await this.addAnnotation(
                currentPdfBytes,
                annotation.boundingBox,
                annotation.pageNumber || 0,
                annotation.options || {}
            );
        }
        
        return currentPdfBytes;
    }
    
    /**
     * Create annotation from text match result
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {Object} matchResult - Result from text matcher
     * @param {Object} boundingBox - Extracted bounding box
     * @param {Object} options - Annotation options
     * @returns {Promise<Uint8Array>} Modified PDF bytes
     */
    async annotateFromMatch(pdfBytes, matchResult, boundingBox, options = {}) {
        const annotationOptions = {
            ...options,
            label: options.showLabel ? matchResult.text : undefined
        };
        
        return this.addAnnotation(pdfBytes, boundingBox, 0, annotationOptions);
    }
    
    /**
     * Add text label near the annotation
     * @private
     */
    _addTextLabel(page, coords, label, options = {}) {
        const fontSize = options.labelFontSize || 12;
        const labelColor = options.labelColor || rgb(0, 0, 0);
        
        // Position label above the rectangle
        const labelX = coords.x;
        const labelY = coords.y + coords.height + 5;
        
        page.drawText(label, {
            x: labelX,
            y: labelY,
            size: fontSize,
            color: labelColor
        });
    }
    
    /**
     * Get PDF page information
     * @param {Uint8Array} pdfBytes - PDF bytes
     * @returns {Promise<Array>} Array of page info objects
     */
    async getPagesInfo(pdfBytes) {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        
        return pages.map((page, index) => {
            const { width, height } = page.getSize();
            return {
                pageNumber: index,
                width: width,
                height: height
            };
        });
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    // Node.js environment - basic test setup
    console.log('PDF Annotator module loaded');
    console.log('Note: Full testing requires pdf-lib dependency and PDF file');
    
    // Test coordinate transformation
    const annotator = new PDFAnnotator();
    
    const hocrBbox = { x1: 100, y1: 200, x2: 300, y2: 250 };
    const hocrPageSize = { width: 2560, height: 3300 };
    const pdfPageSize = { width: 612, height: 792 }; // Standard US Letter
    
    const pdfCoords = annotator.transformCoordinates(hocrBbox, hocrPageSize, pdfPageSize);
    console.log('Coordinate transformation test:');
    console.log('hOCR bbox:', hocrBbox);
    console.log('PDF coords:', pdfCoords);
    console.log('Valid coordinates:', pdfCoords.x >= 0 && pdfCoords.y >= 0);
}