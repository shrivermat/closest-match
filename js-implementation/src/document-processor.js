/**
 * Document Processor - Main Orchestration Class
 * Combines all components for complete document annotation pipeline
 */

import { TextMatcher } from './text-matcher.js';
import { HOCRParser } from './hocr-parser.js';
import { BoundingBoxExtractor } from './bbox-extractor-simple.js';
import { PDFAnnotator } from './pdf-annotator-browser.js';
import { TextHighlighter } from './text-highlighter.js';

export class DocumentProcessor {
    constructor(options = {}) {
        this.textMatcher = new TextMatcher();
        this.hocrParser = new HOCRParser();
        this.bboxExtractor = new BoundingBoxExtractor();
        this.pdfAnnotator = new PDFAnnotator({
            debugMode: options.debugMode,
            ...(options.annotation || {})
        });
        this.textHighlighter = new TextHighlighter({
            debugMode: options.debugMode,
            ...(options.highlighting || {})
        });
        
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
            
            // Step 4a: Extract hOCR page dimensions automatically
            this._log('Extracting hOCR page dimensions...');
            const hocrPageDimensions = await this.hocrParser.getPageDimensions(hocrContent);
            
            if (hocrPageDimensions) {
                this._log(`Extracted hOCR page dimensions: ${hocrPageDimensions.width} x ${hocrPageDimensions.height}`);
            } else {
                this._log('Could not extract hOCR page dimensions, checking PDF dimensions...');
            }
            
            // Step 4b: If no hOCR dimensions, try to get PDF page dimensions
            let finalPageDimensions = options.hocrPageSize || hocrPageDimensions;
            
            if (!finalPageDimensions) {
                try {
                    this._log('Extracting PDF page dimensions as fallback...');
                    const pdfPagesInfo = await this.pdfAnnotator.getPagesInfo(pdfBytes);
                    if (pdfPagesInfo && pdfPagesInfo.length > pageNumber) {
                        const pdfPage = pdfPagesInfo[pageNumber];
                        finalPageDimensions = {
                            width: pdfPage.width,
                            height: pdfPage.height
                        };
                        this._log(`Using PDF page dimensions: ${finalPageDimensions.width} x ${finalPageDimensions.height}`);
                    }
                } catch (error) {
                    this._log(`Failed to extract PDF page dimensions: ${error.message}`);
                }
            }
            
            const annotationOptions = {
                color: options.color,
                opacity: options.opacity,
                borderWidth: options.borderWidth,
                showLabel: options.showLabel,
                hocrPageSize: finalPageDimensions  // Use three-tier fallback: provided → hOCR → PDF
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
     * Complete document processing pipeline with text highlighting support
     * @param {string} hocrContent - Raw hOCR HTML content
     * @param {Uint8Array} pdfBytes - Original PDF bytes
     * @param {string} searchText - Text to search for and annotate
     * @param {string} formattedText - Optional formatted text with highlight markup
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Result with annotated PDF and metadata
     */
    async processDocumentWithHighlights(hocrContent, pdfBytes, searchText, formattedText = null, options = {}) {
        // Store hOCR content for later use
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
            
            // Step 3: Extract bounding box coordinates
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
            
            // Step 4: Create main PDF annotation
            this._log('Creating main PDF annotation...');
            const pageNumber = options.pageNumber || 0;
            
            // Extract hOCR page dimensions
            const hocrPageDimensions = await this.hocrParser.getPageDimensions(hocrContent);
            let finalPageDimensions = options.hocrPageSize || hocrPageDimensions;
            
            if (!finalPageDimensions) {
                try {
                    const pdfPagesInfo = await this.pdfAnnotator.getPagesInfo(pdfBytes);
                    if (pdfPagesInfo && pdfPagesInfo.length > pageNumber) {
                        const pdfPage = pdfPagesInfo[pageNumber];
                        finalPageDimensions = {
                            width: pdfPage.width,
                            height: pdfPage.height
                        };
                        this._log(`Using PDF page dimensions: ${finalPageDimensions.width} x ${finalPageDimensions.height}`);
                    }
                } catch (error) {
                    this._log(`Failed to extract PDF page dimensions: ${error.message}`);
                }
            }
            
            const annotationOptions = {
                color: options.color,
                opacity: options.opacity,
                borderWidth: options.borderWidth,
                showLabel: options.showLabel,
                hocrPageSize: finalPageDimensions
            };
            
            let annotatedPdfBytes = await this.pdfAnnotator.addAnnotation(
                pdfBytes, 
                boundingBox, 
                pageNumber, 
                annotationOptions
            );
            
            // Step 5: Add text highlights if formattedText is provided
            let highlightCoordinates = [];
            if (formattedText) {
                this._log('Processing formatted text for highlights...');
                
                // Parse formatted text to extract annotation information (highlights, strikethrough, underline)
                const annotations = this.textHighlighter.parseFormattedText(formattedText);
                
                if (annotations.length > 0) {
                    this._log(`Found ${annotations.length} annotation sections:`, annotations.map(a => `${a.type}: "${a.text}"`));
                    
                    // Extract words within the bounding box area
                    const allWords = this.textHighlighter.extractAllWordsFromHocr(hocrContent);
                    const wordsInArea = this.textHighlighter.filterWordsWithinBoundingBox(
                        allWords, 
                        [boundingBox.x1, boundingBox.y1, boundingBox.x2, boundingBox.y2]
                    );
                    
                    if (wordsInArea.length > 0) {
                        this._log(`Found ${wordsInArea.length} words within rectangle area`);
                        
                        // Match annotation text sections to specific word coordinates
                        highlightCoordinates = this.textHighlighter.matchAnnotationTextToWords(wordsInArea, annotations);
                        
                        if (highlightCoordinates.length > 0) {
                            this._log(`Created ${highlightCoordinates.length} annotation coordinate sets`);
                            
                            // Add text annotations (highlights, strikethrough, underline)
                            annotatedPdfBytes = await this.pdfAnnotator.addTextAnnotations(
                                annotatedPdfBytes,
                                highlightCoordinates,
                                pageNumber,
                                finalPageDimensions,
                                { opacity: options.highlightOpacity || 0.5 }
                            );
                            
                            this._log('Text annotations added successfully');
                        } else {
                            this._log('No annotation coordinates could be generated');
                        }
                    } else {
                        this._log('No words found within rectangle area for annotations');
                    }
                } else {
                    this._log('No annotations found in formatted text');
                }
            }
            
            this._log('Document processing with highlights completed successfully');
            
            return {
                success: true,
                annotatedPdf: annotatedPdfBytes,
                matchResult: matchResult,
                boundingBox: boundingBox,
                highlightCoordinates: highlightCoordinates,
                metadata: {
                    searchText: searchText,
                    formattedText: formattedText,
                    similarity: matchResult.similarity,
                    embeddedTextLength: embeddedText.length,
                    pageNumber: pageNumber,
                    highlightsCreated: highlightCoordinates.length
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