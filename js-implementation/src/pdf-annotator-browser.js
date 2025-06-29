/**
 * PDF Annotator - Browser Version with CDN pdf-lib
 * Uses pdf-lib.js loaded from CDN for client-side PDF manipulation
 */

export class PDFAnnotator {
    constructor(options = {}) {
        // Check if pdf-lib is available
        if (typeof window !== 'undefined' && !window.PDFLib) {
            throw new Error('pdf-lib not loaded. Please include: <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>');
        }
        
        this.PDFLib = typeof window !== 'undefined' ? window.PDFLib : null;
        this.defaultAnnotationColor = options.color || this.rgb(1, 0, 0); // Red
        this.defaultAnnotationOpacity = options.opacity || 0.3;
        this.borderWidth = options.borderWidth || 2;
        this.debugMode = options.debugMode || false;
    }
    
    // Helper to access PDFLib functions
    rgb(r, g, b) {
        return this.PDFLib ? this.PDFLib.rgb(r, g, b) : { r, g, b };
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
        
        if (!this.PDFLib) {
            throw new Error('pdf-lib not available');
        }
        
        // Load the PDF document
        const pdfDoc = await this.PDFLib.PDFDocument.load(pdfBytes);
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
        
        // Create selectable rectangle annotation using pdf-lib's low-level API
        try {
            // Create annotation dictionary
            const annotation = pdfDoc.context.obj({
                Type: 'Annot',
                Subtype: 'Square',
                Rect: [
                    pdfCoords.x,
                    pdfCoords.y,
                    pdfCoords.x + pdfCoords.width,
                    pdfCoords.y + pdfCoords.height
                ],
                C: [color.red || color.r || 1, color.green || color.g || 0, color.blue || color.b || 0],
                CA: opacity,
                BS: {
                    W: borderWidth,
                    S: 'S'
                },
                F: 4, // Print flag
                Contents: this.PDFLib.PDFString.of(options.label || 'Text Match Annotation'),
                T: this.PDFLib.PDFString.of('TextMatch'), // Title
                M: this.PDFLib.PDFString.of(new Date().toISOString()), // Modified date
                CreationDate: this.PDFLib.PDFString.of(new Date().toISOString()),
                P: page.ref // Reference to page
            });
            
            // Register the annotation
            const annotRef = pdfDoc.context.register(annotation);
            
            // Add annotation to page's annotation array
            const existingAnnots = page.node.get(this.PDFLib.PDFName.of('Annots'));
            if (existingAnnots) {
                existingAnnots.push(annotRef);
            } else {
                page.node.set(this.PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
            }
            
            this._log(`Created selectable annotation at [${pdfCoords.x}, ${pdfCoords.y}, ${pdfCoords.width}, ${pdfCoords.height}]`);
            
        } catch (error) {
            // Fallback to visual rectangle if annotation creation fails
            console.warn('Failed to create selectable annotation, falling back to visual rectangle:', error);
            page.drawRectangle({
                x: pdfCoords.x,
                y: pdfCoords.y,
                width: pdfCoords.width,
                height: pdfCoords.height,
                borderColor: color,
                borderWidth: borderWidth,
                opacity: opacity
            });
        }
        
        // Optionally add text label
        if (options.label) {
            this._addTextLabel(page, pdfCoords, options.label, options);
        }
        
        // Save and return the PDF with proper xref+trailer format
        return await pdfDoc.save({ useObjectStreams: false });
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
        
        // Validate input parameters
        if (!hocrBbox || !hocrSize || !pdfPageSize) {
            throw new Error(`Invalid coordinates transformation parameters: hocrBbox=${JSON.stringify(hocrBbox)}, hocrSize=${JSON.stringify(hocrSize)}, pdfPageSize=${JSON.stringify(pdfPageSize)}`);
        }
        
        // Validate numeric values
        if (!Number.isFinite(hocrSize.width) || !Number.isFinite(hocrSize.height) || hocrSize.width <= 0 || hocrSize.height <= 0) {
            throw new Error(`Invalid hOCR page size: width=${hocrSize.width}, height=${hocrSize.height}`);
        }
        if (!Number.isFinite(pdfPageSize.width) || !Number.isFinite(pdfPageSize.height) || pdfPageSize.width <= 0 || pdfPageSize.height <= 0) {
            throw new Error(`Invalid PDF page size: width=${pdfPageSize.width}, height=${pdfPageSize.height}`);
        }
        if (!Number.isFinite(hocrBbox.x1) || !Number.isFinite(hocrBbox.y1) || !Number.isFinite(hocrBbox.x2) || !Number.isFinite(hocrBbox.y2)) {
            throw new Error(`Invalid hOCR bounding box: x1=${hocrBbox.x1}, y1=${hocrBbox.y1}, x2=${hocrBbox.x2}, y2=${hocrBbox.y2}`);
        }
        
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
        
        // Final validation of results
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
            throw new Error(`Coordinate transformation produced invalid results: x=${x}, y=${y}, width=${width}, height=${height}`);
        }
        
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
        const labelColor = options.labelColor || this.rgb(0, 0, 0);
        
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
        if (!this.PDFLib) {
            throw new Error('pdf-lib not available');
        }
        
        const pdfDoc = await this.PDFLib.PDFDocument.load(pdfBytes);
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
    
    /**
     * Add text highlight annotations with multi-quad support
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {Array} highlightCoordinates - Array of highlight coordinate objects with quads
     * @param {number} pageNumber - Page number (0-indexed)
     * @param {Object} hocrPageSize - hOCR page dimensions for coordinate transformation
     * @param {Object} options - Highlight options
     * @returns {Promise<Uint8Array>} Modified PDF bytes
     */
    async addTextHighlights(pdfBytes, highlightCoordinates, pageNumber = 0, hocrPageSize = null, options = {}) {
        if (!this.PDFLib) {
            throw new Error('pdf-lib not available');
        }
        
        if (!highlightCoordinates || highlightCoordinates.length === 0) {
            this._log('No highlight coordinates provided');
            return pdfBytes;
        }
        
        // Load the PDF document
        const pdfDoc = await this.PDFLib.PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        
        if (pageNumber >= pages.length) {
            throw new Error(`Page ${pageNumber} does not exist. PDF has ${pages.length} pages.`);
        }
        
        const page = pages[pageNumber];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        this._log(`Adding ${highlightCoordinates.length} text highlight annotations to page ${pageNumber}`);
        
        // Create text highlight annotations for each highlight coordinate set
        for (const highlightCoord of highlightCoordinates) {
            this._log(`Creating multi-line highlight annotation for: "${highlightCoord.text}" with ${highlightCoord.quads.length} quads`);
            
            // Transform each quad to PDF space and collect QuadPoints
            const allQuadPoints = [];
            let overallPdfRect = null;
            
            for (let i = 0; i < highlightCoord.quads.length; i++) {
                const quad = highlightCoord.quads[i];
                this._log(`Processing quad ${i+1}: [${quad.x1}, ${quad.y1}, ${quad.x2}, ${quad.y2}] for "${quad.text}"`);
                
                // Transform quad coordinates to PDF space
                const quadPdfCoords = this.transformCoordinates(
                    { x1: quad.x1, y1: quad.y1, x2: quad.x2, y2: quad.y2 },
                    hocrPageSize || { width: 2560, height: 3300 }, // Default hOCR size
                    { width: pageWidth, height: pageHeight },
                    hocrPageSize
                );
                
                const pdfX1 = quadPdfCoords.x;
                const pdfY1 = quadPdfCoords.y;
                const pdfX2 = quadPdfCoords.x + quadPdfCoords.width;
                const pdfY2 = quadPdfCoords.y + quadPdfCoords.height;
                
                // Validate transformed coordinates
                if (!isFinite(pdfX1) || !isFinite(pdfY1) || !isFinite(pdfX2) || !isFinite(pdfY2)) {
                    throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Non-finite PDF coordinates after transformation: [${pdfX1}, ${pdfY1}, ${pdfX2}, ${pdfY2}]`);
                }
                
                // Add QuadPoints for this quad (each quad needs 8 values: x1,y2,x2,y2,x1,y1,x2,y1)
                allQuadPoints.push(pdfX1, pdfY2, pdfX2, pdfY2, pdfX1, pdfY1, pdfX2, pdfY1);
                
                this._log(`Quad ${i+1} PDF coords: [${pdfX1.toFixed(2)}, ${pdfY1.toFixed(2)}, ${pdfX2.toFixed(2)}, ${pdfY2.toFixed(2)}]`);
                
                // Update overall bounding rectangle
                if (overallPdfRect === null) {
                    overallPdfRect = [pdfX1, pdfY1, pdfX2, pdfY2];
                } else {
                    overallPdfRect[0] = Math.min(overallPdfRect[0], pdfX1); // min x
                    overallPdfRect[1] = Math.min(overallPdfRect[1], pdfY1); // min y
                    overallPdfRect[2] = Math.max(overallPdfRect[2], pdfX2); // max x
                    overallPdfRect[3] = Math.max(overallPdfRect[3], pdfY2); // max y
                }
            }
            
            this._log(`Overall PDF Rect: [${overallPdfRect.map(v => v.toFixed(2)).join(', ')}]`);
            this._log(`QuadPoints array length: ${allQuadPoints.length} (${allQuadPoints.length/8} quads)`);
            
            try {
                // Validate numeric values before creating annotation
                const validRect = overallPdfRect.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
                const validQuadPoints = allQuadPoints.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
                const validColors = [highlightCoord.color.r, highlightCoord.color.g, highlightCoord.color.b].every(val => 
                    typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= 0 && val <= 255
                );
                
                if (!validRect || !validQuadPoints || !validColors || allQuadPoints.length === 0 || allQuadPoints.length % 8 !== 0) {
                    throw new Error(`Invalid annotation values: rect=${validRect}, quadPoints=${validQuadPoints}, colors=${validColors}, quadLength=${allQuadPoints.length}`);
                }
                
                // Ensure all numeric values are properly formatted (same as addTextAnnotations)
                const safeRect = overallPdfRect.map(val => Number(val.toFixed(6)));
                const safeQuadPoints = allQuadPoints.map(val => Number(val.toFixed(6)));
                const safeColors = [
                    Number((highlightCoord.color.r / 255).toFixed(6)),
                    Number((highlightCoord.color.g / 255).toFixed(6)),
                    Number((highlightCoord.color.b / 255).toFixed(6))
                ];
                const safeOpacity = Number((options.opacity || 0.5).toFixed(6));
                
                // Final defensive check - ensure no NaN or infinite values
                if (safeRect.some(val => !isFinite(val))) {
                    throw new Error(`NaN or infinite value in safeRect: [${safeRect.join(', ')}]`);
                }
                if (safeQuadPoints.some(val => !isFinite(val))) {
                    throw new Error(`NaN or infinite value in safeQuadPoints`);
                }
                if (safeColors.some(val => !isFinite(val))) {
                    throw new Error(`NaN or infinite value in safeColors: [${safeColors.join(', ')}]`);
                }
                if (!isFinite(safeOpacity)) {
                    throw new Error(`NaN or infinite opacity: ${safeOpacity}`);
                }
                
                // Create text highlight annotation with multiple quads using safe validated values
                const highlightAnnotation = pdfDoc.context.obj({
                    Type: 'Annot',
                    Subtype: 'Highlight',
                    Rect: safeRect, // Use safe validated rectangle
                    QuadPoints: safeQuadPoints, // Use safe validated quad points
                    C: safeColors, // Use safe validated colors
                    CA: safeOpacity, // Use safe validated opacity
                    F: 4, // Print flag - explicit integer
                    Contents: this.PDFLib.PDFString.of(`Multi-line Highlight: ${highlightCoord.text}`),
                    T: this.PDFLib.PDFString.of('TextHighlight'), // Title
                    M: this.PDFLib.PDFString.of(new Date().toISOString()), // Modified date
                    CreationDate: this.PDFLib.PDFString.of(new Date().toISOString()),
                    P: page.ref // Reference to page
                });
                
                // Register the highlight annotation
                const annotRef = pdfDoc.context.register(highlightAnnotation);
                
                // Add to page annotations
                const existingAnnots = page.node.get(this.PDFLib.PDFName.of('Annots'));
                if (existingAnnots) {
                    existingAnnots.push(annotRef);
                } else {
                    page.node.set(this.PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
                }
                
                this._log(`✅ Created multi-line highlight annotation for "${highlightCoord.text}" with ${highlightCoord.quads.length} quads and ${highlightCoord.wordCount} words`);
                
            } catch (error) {
                console.warn(`Failed to create highlight annotation for "${highlightCoord.text}":`, error);
                
                // Fallback: create individual highlights for each quad
                for (const quad of highlightCoord.quads) {
                    const quadPdfCoords = this.transformCoordinates(
                        { x1: quad.x1, y1: quad.y1, x2: quad.x2, y2: quad.y2 },
                        hocrPageSize || { width: 2560, height: 3300 },
                        { width: pageWidth, height: pageHeight },
                        hocrPageSize
                    );
                    
                    // Create simple rectangle as fallback
                    page.drawRectangle({
                        x: quadPdfCoords.x,
                        y: quadPdfCoords.y,
                        width: quadPdfCoords.width,
                        height: quadPdfCoords.height,
                        color: this.rgb(highlightCoord.color.r / 255, highlightCoord.color.g / 255, highlightCoord.color.b / 255),
                        opacity: options.opacity || 0.3
                    });
                }
            }
        }
        
        // Save and return the PDF with proper xref+trailer format
        return await pdfDoc.save({ useObjectStreams: false });
    }

    /**
     * Add text annotations with support for highlights, strikethrough, and underline
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {Array} annotationCoordinates - Array of annotation coordinate objects with quads
     * @param {number} pageNumber - Page number (0-indexed)
     * @param {Object} hocrPageSize - hOCR page dimensions for coordinate transformation
     * @param {Object} options - Annotation options
     * @returns {Promise<Uint8Array>} Modified PDF bytes
     */
    async addTextAnnotations(pdfBytes, annotationCoordinates, pageNumber = 0, hocrPageSize = null, options = {}) {
        if (!this.PDFLib) {
            throw new Error('pdf-lib not available');
        }
        
        if (!annotationCoordinates || annotationCoordinates.length === 0) {
            this._log('No annotation coordinates provided');
            return pdfBytes;
        }
        
        // Load the PDF document
        const pdfDoc = await this.PDFLib.PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        
        if (pageNumber >= pages.length) {
            throw new Error(`Page ${pageNumber} does not exist. PDF has ${pages.length} pages.`);
        }
        
        const page = pages[pageNumber];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        this._log(`Adding ${annotationCoordinates.length} text annotations to page ${pageNumber}`);
        
        // Create annotations for each coordinate set
        for (let annotationIndex = 0; annotationIndex < annotationCoordinates.length; annotationIndex++) {
            const annotationCoord = annotationCoordinates[annotationIndex];
            const annotationType = annotationCoord.type || 'highlight'; // Default to highlight for backward compatibility
            this._log(`Creating ${annotationType} annotation #${annotationIndex + 1} for: "${annotationCoord.text}" with ${annotationCoord.quads.length} quads`);
            
            // Transform each quad to PDF space and collect QuadPoints
            const allQuadPoints = [];
            let overallPdfRect = null;
            
            // Validate input quads first
            for (let i = 0; i < annotationCoord.quads.length; i++) {
                const quad = annotationCoord.quads[i];
                if (!quad || typeof quad.x1 !== 'number' || typeof quad.y1 !== 'number' || 
                    typeof quad.x2 !== 'number' || typeof quad.y2 !== 'number') {
                    throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Invalid quad ${i+1} coordinates: ${JSON.stringify(quad)}`);
                }
                if (!isFinite(quad.x1) || !isFinite(quad.y1) || !isFinite(quad.x2) || !isFinite(quad.y2)) {
                    throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Non-finite values in quad ${i+1}: [${quad.x1}, ${quad.y1}, ${quad.x2}, ${quad.y2}]`);
                }
                this._log(`Processing quad ${i+1}: [${quad.x1}, ${quad.y1}, ${quad.x2}, ${quad.y2}] for "${quad.text}"`);
                
                // Transform quad coordinates to PDF space
                const quadPdfCoords = this.transformCoordinates(
                    { x1: quad.x1, y1: quad.y1, x2: quad.x2, y2: quad.y2 },
                    hocrPageSize || { width: 2560, height: 3300 }, // Default hOCR size
                    { width: pageWidth, height: pageHeight },
                    hocrPageSize
                );
                
                const pdfX1 = quadPdfCoords.x;
                const pdfY1 = quadPdfCoords.y;
                const pdfX2 = quadPdfCoords.x + quadPdfCoords.width;
                const pdfY2 = quadPdfCoords.y + quadPdfCoords.height;
                
                // Validate transformed coordinates
                if (!isFinite(pdfX1) || !isFinite(pdfY1) || !isFinite(pdfX2) || !isFinite(pdfY2)) {
                    throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Non-finite PDF coordinates after transformation: [${pdfX1}, ${pdfY1}, ${pdfX2}, ${pdfY2}]`);
                }
                
                // Add QuadPoints for this quad (each quad needs 8 values: x1,y2,x2,y2,x1,y1,x2,y1)
                allQuadPoints.push(pdfX1, pdfY2, pdfX2, pdfY2, pdfX1, pdfY1, pdfX2, pdfY1);
                
                this._log(`Quad ${i+1} PDF coords: [${pdfX1.toFixed(2)}, ${pdfY1.toFixed(2)}, ${pdfX2.toFixed(2)}, ${pdfY2.toFixed(2)}]`);
                
                // Update overall bounding rectangle
                if (overallPdfRect === null) {
                    overallPdfRect = [pdfX1, pdfY1, pdfX2, pdfY2];
                } else {
                    overallPdfRect[0] = Math.min(overallPdfRect[0], pdfX1); // min x
                    overallPdfRect[1] = Math.min(overallPdfRect[1], pdfY1); // min y
                    overallPdfRect[2] = Math.max(overallPdfRect[2], pdfX2); // max x
                    overallPdfRect[3] = Math.max(overallPdfRect[3], pdfY2); // max y
                }
            }
            
            // Validate all numeric values before creating annotation
            const validRect = overallPdfRect.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
            const validQuadPoints = allQuadPoints.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
            const validColors = [annotationCoord.color.r, annotationCoord.color.g, annotationCoord.color.b].every(val => 
                typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= 0 && val <= 255
            );
            
            if (!validRect) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Invalid Rect values: [${overallPdfRect.join(', ')}]`);
            }
            if (!validQuadPoints || allQuadPoints.length === 0 || allQuadPoints.length % 8 !== 0) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Invalid QuadPoints: length=${allQuadPoints.length}, values=[${allQuadPoints.slice(0, 16).join(', ')}...]`);
            }
            if (!validColors) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): Invalid color values: r=${annotationCoord.color.r}, g=${annotationCoord.color.g}, b=${annotationCoord.color.b}`);
            }
            
            this._log(`✅ Validation passed - Rect: [${overallPdfRect.map(v => v.toFixed(2)).join(', ')}]`);
            this._log(`✅ Validation passed - QuadPoints: ${allQuadPoints.length} values (${allQuadPoints.length/8} quads)`);
            
            // Ensure all numeric values are properly formatted
            const safeRect = overallPdfRect.map(val => Number(val.toFixed(6)));
            const safeQuadPoints = allQuadPoints.map(val => Number(val.toFixed(6)));
            const safeColors = [
                Number((annotationCoord.color.r / 255).toFixed(6)),
                Number((annotationCoord.color.g / 255).toFixed(6)),
                Number((annotationCoord.color.b / 255).toFixed(6))
            ];
            const safeOpacity = Number((options.opacity || 0.5).toFixed(6));
            
            // Final defensive check - ensure no NaN or infinite values
            if (safeRect.some(val => !isFinite(val))) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): NaN or infinite value in safeRect: [${safeRect.join(', ')}]`);
            }
            if (safeQuadPoints.some(val => !isFinite(val))) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): NaN or infinite value in safeQuadPoints`);
            }
            if (safeColors.some(val => !isFinite(val))) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): NaN or infinite value in safeColors: [${safeColors.join(', ')}]`);
            }
            if (!isFinite(safeOpacity)) {
                throw new Error(`Annotation #${annotationIndex + 1} (${annotationType}): NaN or infinite opacity: ${safeOpacity}`);
            }
            
            this._log(`🔒 Final validation passed for annotation #${annotationIndex + 1} - all values are finite`);
            
            try {
                let annotation;
                
                // Create minimal text markup annotations - no Border Style, no optional properties
                // Use only the essential properties required by PDF specification
                const baseAnnotation = {
                    Type: 'Annot',
                    Rect: safeRect,
                    QuadPoints: safeQuadPoints,
                    C: safeColors,
                    CA: safeOpacity,
                    F: 4, // Print flag - explicit integer
                    P: page.ref
                };
                
                // Set subtype and contents based on annotation type  
                // Calculate safe opacity for this specific annotation type
                let typeSpecificOpacity;
                switch (annotationType) {
                    case 'highlight':
                        baseAnnotation.Subtype = 'Highlight';
                        baseAnnotation.Contents = this.PDFLib.PDFString.of(`Highlight: ${annotationCoord.text}`);
                        typeSpecificOpacity = safeOpacity; // Use the pre-calculated safe opacity
                        break;
                        
                    case 'strikethrough':
                        baseAnnotation.Subtype = 'StrikeOut';
                        baseAnnotation.Contents = this.PDFLib.PDFString.of(`Strike-through: ${annotationCoord.text}`);
                        // Calculate safe opacity for strikethrough
                        typeSpecificOpacity = Number((options.opacity || 0.8).toFixed(6));
                        if (!Number.isFinite(typeSpecificOpacity) || typeSpecificOpacity < 0 || typeSpecificOpacity > 1) {
                            throw new Error(`Annotation #${annotationIndex + 1}: Invalid strikethrough opacity: ${typeSpecificOpacity}`);
                        }
                        break;
                        
                    case 'underline':
                        baseAnnotation.Subtype = 'Underline'; 
                        baseAnnotation.Contents = this.PDFLib.PDFString.of(`Underline: ${annotationCoord.text}`);
                        // Calculate safe opacity for underline
                        typeSpecificOpacity = Number((options.opacity || 0.8).toFixed(6));
                        if (!Number.isFinite(typeSpecificOpacity) || typeSpecificOpacity < 0 || typeSpecificOpacity > 1) {
                            throw new Error(`Annotation #${annotationIndex + 1}: Invalid underline opacity: ${typeSpecificOpacity}`);
                        }
                        break;
                        
                    default:
                        this._log(`⚠️ Unknown annotation type: ${annotationType}, defaulting to highlight`);
                        baseAnnotation.Subtype = 'Highlight';
                        baseAnnotation.Contents = this.PDFLib.PDFString.of(`Annotation: ${annotationCoord.text}`);
                        typeSpecificOpacity = safeOpacity; // Use the pre-calculated safe opacity
                        break;
                }
                
                // Set the validated opacity
                baseAnnotation.CA = typeSpecificOpacity;
                
                // Final validation of the baseAnnotation object before PDF creation
                this._validateBaseAnnotation(baseAnnotation, annotationIndex + 1, annotationType);
                
                // Debug log the exact annotation object being created
                this._log(`🎯 Creating annotation #${annotationIndex + 1} with values:`, {
                    Type: baseAnnotation.Type,
                    Subtype: baseAnnotation.Subtype,
                    Rect: baseAnnotation.Rect,
                    QuadPoints: `Array[${baseAnnotation.QuadPoints.length}]`,
                    C: baseAnnotation.C,
                    CA: baseAnnotation.CA,
                    F: baseAnnotation.F
                });
                
                // Special debugging for annotation #5 (the problematic multi-quad one)
                if (annotationIndex + 1 === 5) {
                    this._log(`🚨 ANNOTATION #5 DETAILED DEBUG:`);
                    this._log(`   Rect values: [${baseAnnotation.Rect.map(v => `${v} (${typeof v})`).join(', ')}]`);
                    this._log(`   QuadPoints length: ${baseAnnotation.QuadPoints.length}`);
                    this._log(`   QuadPoints values: [${baseAnnotation.QuadPoints.slice(0, 8).map(v => `${v} (${typeof v})`).join(', ')}...]`);
                    this._log(`   Color values: [${baseAnnotation.C.map(v => `${v} (${typeof v})`).join(', ')}]`);
                    this._log(`   Opacity: ${baseAnnotation.CA} (${typeof baseAnnotation.CA})`);
                    this._log(`   Flags: ${baseAnnotation.F} (${typeof baseAnnotation.F})`);
                    this._log(`   Page ref: ${baseAnnotation.P ? 'valid' : 'invalid'}`);
                    this._log(`   Contents: ${baseAnnotation.Contents ? 'valid' : 'invalid'}`);
                }
                
                // Use explicit PDF type wrappers for ALL numeric values to prevent empty serialization
                const explicitAnnotation = {
                    Type: this.PDFLib.PDFName.of('Annot'),
                    Subtype: this.PDFLib.PDFName.of(baseAnnotation.Subtype),
                    Rect: pdfDoc.context.obj(baseAnnotation.Rect.map(v => this.PDFLib.PDFNumber.of(v))),
                    QuadPoints: pdfDoc.context.obj(baseAnnotation.QuadPoints.map(v => this.PDFLib.PDFNumber.of(v))),
                    C: pdfDoc.context.obj(baseAnnotation.C.map(v => this.PDFLib.PDFNumber.of(v))),
                    CA: this.PDFLib.PDFNumber.of(baseAnnotation.CA),
                    F: this.PDFLib.PDFNumber.of(4), // Explicit PDFNumber wrapper
                    Contents: baseAnnotation.Contents, // Already wrapped with PDFString.of()
                    P: page.ref
                };
                
                this._log(`🔧 Creating annotation #${annotationIndex + 1} with explicit PDF type wrappers`);
                
                annotation = pdfDoc.context.obj(explicitAnnotation);
                const annotRef = pdfDoc.context.register(annotation);
                
                // Add to page annotations
                const existingAnnots = page.node.get(this.PDFLib.PDFName.of('Annots'));
                if (existingAnnots) {
                    existingAnnots.push(annotRef);
                } else {
                    page.node.set(this.PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
                }
                
                this._log(`✅ Created ${annotationType} annotation #${annotationIndex + 1} for "${annotationCoord.text}" with ${annotationCoord.quads.length} quads and ${annotationCoord.wordCount} words`);
                
            } catch (error) {
                console.warn(`Failed to create ${annotationType} annotation #${annotationIndex + 1} for "${annotationCoord.text}":`, error);
                this._log(`❌ Error in annotation #${annotationIndex + 1}: ${error.message}`);
                
                // Fallback: create simple rectangles for each quad
                for (const quad of annotationCoord.quads) {
                    const quadPdfCoords = this.transformCoordinates(
                        { x1: quad.x1, y1: quad.y1, x2: quad.x2, y2: quad.y2 },
                        hocrPageSize || { width: 2560, height: 3300 },
                        { width: pageWidth, height: pageHeight },
                        hocrPageSize
                    );
                    
                    // Create simple rectangle as fallback
                    page.drawRectangle({
                        x: quadPdfCoords.x,
                        y: quadPdfCoords.y,
                        width: quadPdfCoords.width,
                        height: quadPdfCoords.height,
                        color: this.rgb(annotationCoord.color.r / 255, annotationCoord.color.g / 255, annotationCoord.color.b / 255),
                        opacity: options.opacity || 0.3
                    });
                }
            }
        }
        
        // Save and return the PDF with proper xref+trailer format
        return await pdfDoc.save({ useObjectStreams: false });
    }

    /**
     * Validate base annotation object before PDF creation
     * @private
     */
    _validateBaseAnnotation(baseAnnotation, annotationNumber, annotationType) {
        const errors = [];
        
        // Check required properties exist
        if (!baseAnnotation.Type) errors.push('Missing Type');
        if (!baseAnnotation.Subtype) errors.push('Missing Subtype');
        if (!baseAnnotation.Rect) errors.push('Missing Rect');
        if (!baseAnnotation.QuadPoints) errors.push('Missing QuadPoints');
        if (!baseAnnotation.C) errors.push('Missing C (Color)');
        if (baseAnnotation.CA === undefined || baseAnnotation.CA === null) errors.push('Missing CA (Opacity)');
        if (!baseAnnotation.F) errors.push('Missing F (Flags)');
        if (!baseAnnotation.P) errors.push('Missing P (Page reference)');
        if (!baseAnnotation.Contents) errors.push('Missing Contents');
        
        // Validate Rect array
        if (baseAnnotation.Rect) {
            if (!Array.isArray(baseAnnotation.Rect) || baseAnnotation.Rect.length !== 4) {
                errors.push(`Invalid Rect array: length=${baseAnnotation.Rect?.length}, expected 4`);
            } else {
                for (let i = 0; i < 4; i++) {
                    const val = baseAnnotation.Rect[i];
                    if (typeof val !== 'number' || !Number.isFinite(val)) {
                        errors.push(`Invalid Rect[${i}]: ${val} (type: ${typeof val})`);
                    }
                }
            }
        }
        
        // Validate QuadPoints array
        if (baseAnnotation.QuadPoints) {
            if (!Array.isArray(baseAnnotation.QuadPoints) || baseAnnotation.QuadPoints.length === 0 || baseAnnotation.QuadPoints.length % 8 !== 0) {
                errors.push(`Invalid QuadPoints array: length=${baseAnnotation.QuadPoints?.length}, must be multiple of 8`);
            } else {
                for (let i = 0; i < baseAnnotation.QuadPoints.length; i++) {
                    const val = baseAnnotation.QuadPoints[i];
                    if (typeof val !== 'number' || !Number.isFinite(val)) {
                        errors.push(`Invalid QuadPoints[${i}]: ${val} (type: ${typeof val})`);
                    }
                }
            }
        }
        
        // Validate Color array
        if (baseAnnotation.C) {
            if (!Array.isArray(baseAnnotation.C) || baseAnnotation.C.length !== 3) {
                errors.push(`Invalid Color array: length=${baseAnnotation.C?.length}, expected 3`);
            } else {
                for (let i = 0; i < 3; i++) {
                    const val = baseAnnotation.C[i];
                    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1) {
                        errors.push(`Invalid Color[${i}]: ${val} (type: ${typeof val}), must be 0-1`);
                    }
                }
            }
        }
        
        // Validate Opacity
        if (typeof baseAnnotation.CA !== 'number' || !Number.isFinite(baseAnnotation.CA) || baseAnnotation.CA < 0 || baseAnnotation.CA > 1) {
            errors.push(`Invalid Opacity (CA): ${baseAnnotation.CA} (type: ${typeof baseAnnotation.CA}), must be 0-1`);
        }
        
        // Validate Flags
        if (typeof baseAnnotation.F !== 'number' || !Number.isInteger(baseAnnotation.F)) {
            errors.push(`Invalid Flags (F): ${baseAnnotation.F} (type: ${typeof baseAnnotation.F}), must be integer`);
        }
        
        // Validate Subtype
        const validSubtypes = ['Highlight', 'StrikeOut', 'Underline'];
        if (!validSubtypes.includes(baseAnnotation.Subtype)) {
            errors.push(`Invalid Subtype: ${baseAnnotation.Subtype}, must be one of: ${validSubtypes.join(', ')}`);
        }
        
        if (errors.length > 0) {
            throw new Error(`Annotation #${annotationNumber} (${annotationType}) validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
        }
        
        this._log(`✅ Annotation #${annotationNumber} validation passed: all properties are valid`);
    }
    
    /**
     * Logging utility
     * @private
     */
    _log(message) {
        if (this.debugMode) {
            console.log(`[PDFAnnotator] ${message}`);
        }
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    console.log('PDF Annotator (Browser) module loaded');
    console.log('Note: This version requires pdf-lib to be loaded from CDN');
}