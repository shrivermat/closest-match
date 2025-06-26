/**
 * hOCR Parser - Pure JavaScript Implementation
 * Uses browser DOM APIs instead of regex for cleaner parsing
 * Ported from Python extract_text.py
 */

export class HOCRParser {
    /**
     * Parse hOCR HTML content and extract embedded text with LINE markers
     * @param {string} hocrContent - Raw hOCR HTML content
     * @returns {Promise<string>} Embedded text with [[PARAGRAPH]] and [[LINE]] markers
     */
    async parseHOCR(hocrContent) {
        if (!hocrContent) {
            return '';
        }
        
        // Use DOMParser for clean HTML parsing (much better than regex!)
        let doc;
        if (typeof window !== 'undefined') {
            // Browser environment
            const parser = new DOMParser();
            doc = parser.parseFromString(hocrContent, 'text/html');
        } else {
            // Node.js environment - use jsdom
            try {
                const { JSDOM } = await import('jsdom');
                const dom = new JSDOM(hocrContent);
                doc = dom.window.document;
            } catch (error) {
                // Fallback to regex-based parsing for testing
                return this._parseHOCRWithRegex(hocrContent);
            }
        }
        
        return this.extractEmbeddedText(doc);
    }
    
    /**
     * Extract embedded text from parsed HTML document
     * @param {Document} doc - Parsed HTML document
     * @returns {string} Formatted text with markers
     */
    extractEmbeddedText(doc) {
        const embeddedText = [];
        
        // Find all paragraph elements (OCR paragraphs)
        const paragraphs = doc.querySelectorAll('.ocr_par, [class*="ocr_par"]');
        
        paragraphs.forEach(paragraph => {
            embeddedText.push('[[PARAGRAPH]]');
            
            // Find all line elements within this paragraph
            const lines = paragraph.querySelectorAll('.ocr_line, [class*="ocr_line"]');
            
            lines.forEach(line => {
                // Extract bounding box from title attribute
                const bbox = this.extractBoundingBox(line);
                if (bbox) {
                    const lineMarker = `[[LINE ${bbox.x1} ${bbox.y1} ${bbox.x2} ${bbox.y2}]]`;
                    embeddedText.push(lineMarker);
                }
                
                // Extract words within this line
                const words = line.querySelectorAll('.ocrx_word, [class*="ocrx_word"]');
                
                words.forEach(wordElement => {
                    const wordText = wordElement.textContent.trim();
                    if (wordText) {
                        embeddedText.push(wordText);
                    }
                });
            });
        });
        
        return embeddedText.join(' ');
    }
    
    /**
     * Extract bounding box coordinates from title attribute
     * @param {Element} element - HTML element with title containing bbox
     * @returns {Object|null} Bounding box coordinates or null
     */
    extractBoundingBox(element) {
        const title = element.getAttribute('title');
        if (!title) return null;
        
        // Look for bbox pattern: "bbox x1 y1 x2 y2"
        const bboxMatch = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (!bboxMatch) return null;
        
        return {
            x1: parseInt(bboxMatch[1], 10),
            y1: parseInt(bboxMatch[2], 10),
            x2: parseInt(bboxMatch[3], 10),
            y2: parseInt(bboxMatch[4], 10)
        };
    }
    
    /**
     * Extract all word bounding boxes from hOCR content
     * Useful for debugging and visualization
     * @param {string} hocrContent - Raw hOCR HTML content
     * @returns {Array} Array of word objects with text and coordinates
     */
    extractAllWords(hocrContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(hocrContent, 'text/html');
        const words = [];
        
        const wordElements = doc.querySelectorAll('.ocrx_word, [class*="ocrx_word"]');
        
        wordElements.forEach(wordElement => {
            const text = wordElement.textContent.trim();
            const bbox = this.extractBoundingBox(wordElement);
            
            if (text && bbox) {
                words.push({
                    text: text,
                    x1: bbox.x1,
                    y1: bbox.y1,
                    x2: bbox.x2,
                    y2: bbox.y2
                });
            }
        });
        
        return words;
    }
    
    /**
     * Get page dimensions from hOCR content
     * @param {string} hocrContent - Raw hOCR HTML content
     * @returns {Object|null} Page dimensions or null
     */
    async getPageDimensions(hocrContent) {
        let doc;
        if (typeof window !== 'undefined') {
            const parser = new DOMParser();
            doc = parser.parseFromString(hocrContent, 'text/html');
        } else {
            try {
                const { JSDOM } = await import('jsdom');
                const dom = new JSDOM(hocrContent);
                doc = dom.window.document;
            } catch (error) {
                // Fallback to regex
                const pageMatch = hocrContent.match(/class=['"]ocr_page['"][^>]*title=['"]([^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))/);
                if (pageMatch) {
                    const x1 = parseInt(pageMatch[2], 10);
                    const y1 = parseInt(pageMatch[3], 10);
                    const x2 = parseInt(pageMatch[4], 10);
                    const y2 = parseInt(pageMatch[5], 10);
                    return {
                        width: x2 - x1,
                        height: y2 - y1,
                        bbox: { x1, y1, x2, y2 }
                    };
                }
                return null;
            }
        }
        
        const page = doc.querySelector('.ocr_page, [class*="ocr_page"]');
        if (!page) return null;
        
        const bbox = this.extractBoundingBox(page);
        if (!bbox) return null;
        
        return {
            width: bbox.x2 - bbox.x1,
            height: bbox.y2 - bbox.y1,
            bbox: bbox
        };
    }
    
    /**
     * Fallback regex-based parsing for Node.js testing
     * @private
     */
    _parseHOCRWithRegex(hocrContent) {
        const embeddedText = [];
        
        // Find paragraphs and lines using regex
        const parMatches = [...hocrContent.matchAll(/<p[^>]*class=['"]ocr_par['"][^>]*>/g)];
        
        for (const parMatch of parMatches) {
            embeddedText.push('[[PARAGRAPH]]');
            
            // Find the content after this paragraph tag
            const parStart = parMatch.index + parMatch[0].length;
            const parContent = hocrContent.substring(parStart);
            const parEnd = parContent.indexOf('</p>');
            const actualParContent = parEnd > 0 ? parContent.substring(0, parEnd) : parContent;
            
            // Extract lines
            const lineMatches = [...actualParContent.matchAll(/<span[^>]*class=['"]ocr_line['"][^>]*title=['"]([^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))[^'"]*['"][^>]*>/g)];
            
            for (const lineMatch of lineMatches) {
                const x1 = lineMatch[2];
                const y1 = lineMatch[3];
                const x2 = lineMatch[4];
                const y2 = lineMatch[5];
                embeddedText.push(`[[LINE ${x1} ${y1} ${x2} ${y2}]]`);
                
                // Extract words in this line
                const lineStart = lineMatch.index + lineMatch[0].length;
                const lineContent = actualParContent.substring(lineStart);
                const lineEndMatch = lineContent.indexOf('</span>');
                const actualLineContent = lineEndMatch > 0 ? lineContent.substring(0, lineEndMatch) : lineContent;
                
                const wordMatches = [...actualLineContent.matchAll(/<span[^>]*class=['"]ocrx_word['"][^>]*>([^<]*)<\/span>/g)];
                for (const wordMatch of wordMatches) {
                    const word = wordMatch[1].trim();
                    if (word) {
                        embeddedText.push(word);
                    }
                }
            }
        }
        
        return embeddedText.join(' ');
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    // Node.js environment - run basic tests
    (async () => {
        const parser = new HOCRParser();
    
    // Test with sample hOCR content
    const sampleHOCR = `
        <div class='ocr_page' title='bbox 0 0 2560 3300'>
            <p class='ocr_par'>
                <span class='ocr_line' title='bbox 100 200 500 250'>
                    <span class='ocrx_word' title='bbox 100 200 150 250'>Hello</span>
                    <span class='ocrx_word' title='bbox 160 200 220 250'>World</span>
                </span>
                <span class='ocr_line' title='bbox 100 260 400 310'>
                    <span class='ocrx_word' title='bbox 100 260 150 310'>Test</span>
                    <span class='ocrx_word' title='bbox 160 260 220 310'>Text</span>
                </span>
            </p>
        </div>
    `;
    
    console.log('hOCR Parser Test:');
    const result = await parser.parseHOCR(sampleHOCR);
    console.log('Result:', result);
    console.log('Contains PARAGRAPH marker:', result.includes('[[PARAGRAPH]]'));
    console.log('Contains LINE markers:', result.includes('[[LINE'));
    console.log('Contains words:', result.includes('Hello') && result.includes('World'));
    
    // Test page dimensions
    const dimensions = await parser.getPageDimensions(sampleHOCR);
    console.log('Page dimensions:', dimensions);
    })().catch(console.error);
}