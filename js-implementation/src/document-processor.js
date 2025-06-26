/**
 * Document Processor - Main Orchestration Class
 * Combines all components for complete document annotation pipeline
 */

import { TextMatcher } from './text-matcher.js';
import { HOCRParser } from './hocr-parser.js';
import { BoundingBoxExtractor } from './bbox-extractor-simple.js';
import { PDFAnnotator } from './pdf-annotator-browser.js';

export class DocumentProcessor {
    constructor(options = {}) {
        this.textMatcher = new TextMatcher();
        this.hocrParser = new HOCRParser();
        this.bboxExtractor = new BoundingBoxExtractor();
        this.pdfAnnotator = new PDFAnnotator(options.annotation || {});
        
        // Configuration
        this.config = {
            minSimilarity: options.minSimilarity || 0.7,
            debugMode: options.debugMode || false,
            ...options
        };
    }
    
    /**
     * Complete document processing pipeline
     * @param {string} hocrContent - Raw hOCR HTML content
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {string} searchText - Text to search for and annotate
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Result with annotated PDF and metadata
     */
    async processDocument(hocrContent, pdfBytes, searchText, options = {}) {
        // Store hOCR content for bounding box extraction
        this._currentHocrContent = hocrContent;
        try {
            // Step 1: Parse hOCR content
            this._log('Parsing hOCR content...');
            const embeddedText = await this.hocrParser.parseHOCR(hocrContent);
            
            if (!embeddedText) {
                throw new Error('Failed to parse hOCR content or no text found');
            }
            
            this._log(`Extracted ${embeddedText.length} characters of embedded text`);
            
            // Step 2: Find closest text match
            this._log('Finding closest match...');
            const matchResult = this.textMatcher.findClosestMatch(embeddedText, searchText);
            
            if (matchResult.similarity < this.config.minSimilarity) {
                return {
                    success: false,
                    error: `No match found with sufficient similarity (${matchResult.similarity.toFixed(3)} < ${this.config.minSimilarity})`,
                    matchResult: matchResult
                };
            }
            
            this._log(`Found match with ${(matchResult.similarity * 100).toFixed(1)}% similarity: "${matchResult.text}"`);
            
            // Step 3: Extract bounding box coordinates (Python algorithm)
            this._log('Extracting bounding box...');
            const boundingBox = this.bboxExtractor.extractBoundingBox(
                embeddedText,     // Use embedded text like Python
                matchResult.text  // The matched text to find
            );
            
            if (!boundingBox || (boundingBox.x1 === 0 && boundingBox.y1 === 0 && boundingBox.x2 === 0 && boundingBox.y2 === 0)) {
                return {
                    success: false,
                    error: 'Failed to extract valid bounding box coordinates',
                    matchResult: matchResult
                };
            }
            
            this._log(`Extracted bounding box: [${boundingBox.x1}, ${boundingBox.y1}, ${boundingBox.x2}, ${boundingBox.y2}]`);
            
            // Step 4: Create PDF annotation
            this._log('Creating PDF annotation...');
            const pageNumber = options.pageNumber || 0;
            const annotationOptions = {
                color: options.color,
                opacity: options.opacity,
                borderWidth: options.borderWidth,
                showLabel: options.showLabel,
                hocrPageSize: options.hocrPageSize
            };
            
            const annotatedPdfBytes = await this.pdfAnnotator.addAnnotation(
                pdfBytes, 
                boundingBox, 
                pageNumber, 
                annotationOptions
            );
            
            this._log('Document processing completed successfully');
            
            return {
                success: true,
                annotatedPdf: annotatedPdfBytes,
                matchResult: matchResult,
                boundingBox: boundingBox,
                metadata: {
                    searchText: searchText,
                    similarity: matchResult.similarity,
                    embeddedTextLength: embeddedText.length,
                    pageNumber: pageNumber
                }
            };
            
        } catch (error) {
            this._log(`Error during processing: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Test text matching without PDF annotation
     * @param {string} hocrContent - Raw hOCR HTML content
     * @param {string} searchText - Text to search for
     * @returns {Object} Match results with debugging info
     */
    async testTextMatching(hocrContent, searchText) {
        const embeddedText = await this.hocrParser.parseHOCR(hocrContent);
        const matchResult = this.textMatcher.findClosestMatch(embeddedText, searchText);
        
        let boundingBox = null;
        if (matchResult.similarity > 0) {
            boundingBox = this.bboxExtractor.extractBoundingBox(
                embeddedText,     // Use embedded text like Python
                matchResult.text  // The matched text to find
            );
        }
        
        return {
            embeddedText: embeddedText.substring(0, 500) + '...', // Truncate for display
            matchResult: matchResult,
            boundingBox: boundingBox,
            valid: matchResult.similarity >= this.config.minSimilarity && boundingBox !== null
        };
    }
    
    /**
     * Configure processing options
     * @param {Object} newConfig - Configuration updates
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    /**
     * Logging utility
     * @private
     */
    _log(message) {
        if (this.config.debugMode) {
            console.log(`[DocumentProcessor] ${message}`);
        }
    }
}

// Example usage
if (typeof window === 'undefined') {
    console.log('DocumentProcessor module loaded');
    console.log('Ready for browser or Node.js usage');
}