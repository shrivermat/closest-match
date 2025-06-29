/**
 * Text Highlighter - Multi-line text highlighting support for JavaScript implementation
 * Provides formatted text parsing and multi-quad highlight generation
 * Ported from the WASM implementation's multi-line text highlighting features
 */

export class TextHighlighter {
    constructor(options = {}) {
        this.config = {
            lineToleranceY: options.lineToleranceY || 10, // Y-coordinate tolerance for grouping words by line
            boundingBoxPadding: options.boundingBoxPadding || 50, // Padding around bounding box
            debugMode: options.debugMode || false,
            ...options
        };
    }

    /**
     * Parse formatted text with background-color highlighting markup
     * @param {string} formattedText - HTML text with <strong style="background-color: rgb(...)">text</strong>
     * @returns {Array} Array of highlight objects with text and color information
     */
    parseFormattedText(formattedText) {
        if (!formattedText) return [];
        
        const annotations = [];
        
        this._log(`Parsing formatted text: "${formattedText}"`);
        
        // First, normalize escaped quotes to regular quotes
        const normalizedText = formattedText.replace(/\\"/g, '"');
        this._log(`Normalized text: "${normalizedText}"`);
        
        // Use DOMParser to properly handle nested HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${normalizedText}</div>`, 'text/html');
        const container = doc.querySelector('div');
        
        if (!container) {
            this._log('Failed to parse HTML content');
            return [];
        }
        
        // Recursively traverse the DOM tree to find annotations
        this._extractAnnotationsFromNode(container, annotations);
        
        this._log(`Parsed ${annotations.length} formatted text annotations:`, annotations);
        return annotations;
    }

    /**
     * Recursively extract annotations from DOM nodes
     * @private
     * @param {Node} node - DOM node to process
     * @param {Array} annotations - Array to collect annotations
     */
    _extractAnnotationsFromNode(node, annotations) {
        if (node.nodeType === Node.TEXT_NODE) {
            // Text node - no annotation here
            return;
        }
        
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            
            // Check for annotation types
            if (tagName === 's') {
                // Strike-through annotation
                const text = node.textContent.trim();
                if (text) {
                    annotations.push({
                        text: text,
                        type: 'strikethrough',
                        color: { r: 255, g: 0, b: 0 }, // Default red for strike-through
                        hexColor: '#ff0000'
                    });
                    this._log(`Added strike-through: "${text}"`);
                }
                // Don't process children since we already got the text content
                return;
            }
            
            if (tagName === 'u') {
                // Underline annotation
                const text = node.textContent.trim();
                if (text) {
                    annotations.push({
                        text: text,
                        type: 'underline',
                        color: { r: 0, g: 0, b: 255 }, // Default blue for underline
                        hexColor: '#0000ff'
                    });
                    this._log(`Added underline: "${text}"`);
                }
                // Don't process children since we already got the text content
                return;
            }
            
            if ((tagName === 'span' || tagName === 'strong') && node.style && node.style.backgroundColor) {
                // Background color highlight
                const text = node.textContent.trim();
                const bgColor = node.style.backgroundColor;
                
                // Parse RGB color
                const rgbMatch = bgColor.match(/rgb\(([^)]+)\)/);
                if (rgbMatch && text) {
                    const [r, g, b] = rgbMatch[1].split(',').map(v => parseInt(v.trim()));
                    
                    annotations.push({
                        text: text,
                        type: 'highlight',
                        color: { r, g, b },
                        hexColor: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
                    });
                    this._log(`Added highlight: "${text}" with color rgb(${r}, ${g}, ${b})`);
                }
                // Don't process children since we already got the text content
                return;
            }
        }
        
        // Process child nodes for other elements
        for (let child of node.childNodes) {
            this._extractAnnotationsFromNode(child, annotations);
        }
    }

    /**
     * Extract all words from hOCR content with their coordinates
     * @param {string} hocrContent - Raw hOCR HTML content
     * @returns {Array} Array of word objects with coordinates
     */
    extractAllWordsFromHocr(hocrContent) {
        const words = [];
        
        // Use DOMParser for clean HTML parsing
        const parser = new DOMParser();
        const doc = parser.parseFromString(hocrContent, 'text/html');
        
        // Find all word elements
        const wordElements = doc.querySelectorAll('.ocrx_word, [class*="ocrx_word"]');
        
        wordElements.forEach(wordElement => {
            const text = wordElement.textContent.trim();
            const bbox = this._extractBoundingBox(wordElement);
            
            if (text && bbox) {
                words.push({
                    text: text,
                    x1: bbox.x1,
                    y1: bbox.y1,
                    x2: bbox.x2,
                    y2: bbox.y2,
                    center: {
                        x: (bbox.x1 + bbox.x2) / 2,
                        y: (bbox.y1 + bbox.y2) / 2
                    }
                });
            }
        });
        
        this._log(`Extracted ${words.length} words from hOCR`);
        return words;
    }

    /**
     * Filter words to only those within the bounding box (with padding)
     * @param {Array} allWords - All words from hOCR
     * @param {Array} boundingBox - [x1, y1, x2, y2] bounding box coordinates
     * @param {number} tolerance - Padding tolerance (default from config)
     * @returns {Array} Words within the bounding box area
     */
    filterWordsWithinBoundingBox(allWords, boundingBox, tolerance = null) {
        if (tolerance === null) tolerance = this.config.boundingBoxPadding;
        
        const [bboxX1, bboxY1, bboxX2, bboxY2] = boundingBox;
        const wordsInArea = [];
        
        this._log(`Filtering words within bbox [${bboxX1}, ${bboxY1}, ${bboxX2}, ${bboxY2}] with tolerance ${tolerance}`);
        
        for (const word of allWords) {
            // Check for overlap between word box and bounding box (with tolerance)
            const wordOverlaps = !(word.x2 < bboxX1 - tolerance || 
                                  word.x1 > bboxX2 + tolerance ||
                                  word.y2 < bboxY1 - tolerance || 
                                  word.y1 > bboxY2 + tolerance);
            
            if (wordOverlaps) {
                wordsInArea.push(word);
                this._log(`✅ Word "${word.text}" at [${word.x1}, ${word.y1}, ${word.x2}, ${word.y2}] is within area`);
            }
        }
        
        this._log(`Found ${wordsInArea.length} words within bounding box area`);
        return wordsInArea;
    }

    /**
     * Match annotation text sections to specific word coordinates within the area
     * @param {Array} wordsInArea - Words within the target area
     * @param {Array} annotationSections - Parsed annotation sections (highlights, strikethrough, underline)
     * @returns {Array} Array of annotation coordinate objects with quads
     */
    matchAnnotationTextToWords(wordsInArea, annotationSections) {
        const annotationCoordinates = [];
        const usedWordIndices = new Set(); // Track which words have been used
        
        this._log('Matching annotation sections to words:', annotationSections.map(a => `${a.type}: "${a.text}"`));
        this._log('Available words:', wordsInArea.map(w => w.text));
        
        for (const annotation of annotationSections) {
            const searchWords = annotation.text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
            this._log(`Looking for ${annotation.type} "${annotation.text}" (words: ${searchWords.join(', ')})`);
            
            const matchedWords = this._findSequentialWordsInArea(wordsInArea, searchWords, usedWordIndices);
            
            if (matchedWords.length > 0) {
                // Mark these words as used
                matchedWords.forEach(word => {
                    const wordIndex = wordsInArea.indexOf(word);
                    if (wordIndex !== -1) {
                        usedWordIndices.add(wordIndex);
                    }
                });
                
                // Group matched words into lines and create quads for multi-line annotations
                const quads = this._createQuadsFromWords(matchedWords);
                
                // Calculate overall bounding box for all matched words (for the Rect property)
                const x1 = Math.min(...matchedWords.map(w => w.x1));
                const y1 = Math.min(...matchedWords.map(w => w.y1));
                const x2 = Math.max(...matchedWords.map(w => w.x2));
                const y2 = Math.max(...matchedWords.map(w => w.y2));
                
                annotationCoordinates.push({
                    text: annotation.text,
                    type: annotation.type,
                    color: annotation.color,
                    hexColor: annotation.hexColor,
                    boundingBox: [x1, y1, x2, y2], // Overall bounding box for Rect
                    quads: quads, // Array of quads for multi-line annotations
                    words: matchedWords,
                    wordCount: matchedWords.length
                });
                
                this._log(`✅ Matched ${annotation.type} "${annotation.text}" to ${matchedWords.length} words in ${quads.length} quads`);
                this._log(`📝 Matched words: ${matchedWords.map(w => w.text).join(' ')}`);
                this._log(`📐 Quads:`, quads.map((q, i) => `Quad ${i+1}: [${q.x1}, ${q.y1}, ${q.x2}, ${q.y2}] (${q.words.map(w => w.text).join(' ')})`));
            } else {
                this._log(`⚠️ Could not find words for ${annotation.type}: "${annotation.text}"`);
            }
        }
        
        this._log(`Created ${annotationCoordinates.length} annotation coordinate sets`);
        return annotationCoordinates;
    }

    /**
     * Backward compatibility method - alias for matchAnnotationTextToWords
     * @param {Array} wordsInArea - Words within the target area
     * @param {Array} highlightSections - Parsed highlight sections
     * @returns {Array} Array of highlight coordinate objects with quads
     */
    matchHighlightTextToWords(wordsInArea, highlightSections) {
        // Filter to only highlight types for backward compatibility
        const highlights = highlightSections.filter(a => !a.type || a.type === 'highlight');
        return this.matchAnnotationTextToWords(wordsInArea, highlights);
    }

    /**
     * Group words into quads based on their line positions for multi-line highlights
     * @private
     * @param {Array} words - Matched words to group
     * @returns {Array} Array of quad objects
     */
    _createQuadsFromWords(words) {
        if (!words || words.length === 0) return [];
        
        this._log(`Creating quads from ${words.length} words`);
        
        // Group words by line (using Y-coordinate proximity)
        const lineGroups = [];
        
        for (const word of words) {
            let addedToLine = false;
            
            // Try to add to existing line group
            for (const lineGroup of lineGroups) {
                const avgY = lineGroup.reduce((sum, w) => sum + w.center.y, 0) / lineGroup.length;
                if (Math.abs(word.center.y - avgY) <= this.config.lineToleranceY) {
                    lineGroup.push(word);
                    addedToLine = true;
                    break;
                }
            }
            
            // Create new line group if not added to existing one
            if (!addedToLine) {
                lineGroups.push([word]);
            }
        }
        
        this._log(`Grouped words into ${lineGroups.length} lines`);
        
        // Sort line groups by Y position (top to bottom)
        lineGroups.sort((a, b) => {
            const avgYA = a.reduce((sum, w) => sum + w.center.y, 0) / a.length;
            const avgYB = b.reduce((sum, w) => sum + w.center.y, 0) / b.length;
            return avgYA - avgYB;
        });
        
        // Create quads from each line group
        const quads = [];
        for (let i = 0; i < lineGroups.length; i++) {
            const lineWords = lineGroups[i];
            
            // Sort words in this line by X position (left to right)
            lineWords.sort((a, b) => a.x1 - b.x1);
            
            // Create bounding box for this line
            const x1 = Math.min(...lineWords.map(w => w.x1));
            const y1 = Math.min(...lineWords.map(w => w.y1));
            const x2 = Math.max(...lineWords.map(w => w.x2));
            const y2 = Math.max(...lineWords.map(w => w.y2));
            
            quads.push({
                x1, y1, x2, y2,
                words: lineWords,
                lineIndex: i,
                text: lineWords.map(w => w.text).join(' ')
            });
            
            this._log(`Quad ${i+1}: [${x1}, ${y1}, ${x2}, ${y2}] for "${lineWords.map(w => w.text).join(' ')}"`);
        }
        
        return quads;
    }

    /**
     * Find sequential words in area that match the search terms
     * @private
     * @param {Array} wordsInArea - Available words
     * @param {Array} searchWords - Words to search for
     * @param {Set} usedWordIndices - Indices of words already used by previous annotations
     * @returns {Array} Best matching word sequence
     */
    _findSequentialWordsInArea(wordsInArea, searchWords, usedWordIndices = new Set()) {
        if (!wordsInArea.length || !searchWords.length) return [];
        
        // Sort words by position (top to bottom, left to right)
        const sortedWords = wordsInArea.slice().sort((a, b) => {
            const yDiff = a.y1 - b.y1;
            return Math.abs(yDiff) < 10 ? a.x1 - b.x1 : yDiff; // Same line if Y difference < 10px
        });
        
        this._log(`Searching ${searchWords.length} words in ${sortedWords.length} sorted words`);
        this._log(`Search words: ${searchWords.join(', ')}`);
        this._log(`Available words: ${sortedWords.map(w => w.text).join(' ')}`);
        this._log(`Used word indices: ${Array.from(usedWordIndices)}`);
        
        // Use sliding window to find the best match
        let bestMatch = [];
        let bestScore = 0;
        
        for (let startIdx = 0; startIdx <= sortedWords.length - searchWords.length; startIdx++) {
            const candidateWords = [];
            let searchIdx = 0;
            
            for (let wordIdx = startIdx; wordIdx < sortedWords.length && searchIdx < searchWords.length; wordIdx++) {
                const word = sortedWords[wordIdx];
                const searchWord = searchWords[searchIdx];
                const originalWordIndex = wordsInArea.indexOf(word);
                
                // Skip words that have already been used
                if (usedWordIndices.has(originalWordIndex)) {
                    this._log(`⏭️ Skipping already used word: "${word.text}" at index ${originalWordIndex}`);
                    continue;
                }
                
                if (this._wordsMatch(word.text, searchWord)) {
                    candidateWords.push(word);
                    searchIdx++;
                    this._log(`✅ Match: "${word.text}" matches search "${searchWord}"`);
                } else if (candidateWords.length === 0) {
                    // No progress yet, can skip this word
                    continue;
                } else {
                    // We were building a sequence but hit a non-match
                    // For partial matches, we might want to be more flexible
                    const similarity = this._calculateWordSimilarity(word.text, searchWord);
                    if (similarity > 0.7) {
                        candidateWords.push(word);
                        searchIdx++;
                        this._log(`🔄 Fuzzy match: "${word.text}" ~= search "${searchWord}" (${similarity.toFixed(2)})`);
                    } else {
                        break; // End this sequence
                    }
                }
            }
            
            // Score this match (prefer exact matches and complete sequences)
            const score = (searchIdx / searchWords.length) * candidateWords.length;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidateWords;
                this._log(`🏆 New best match with score ${score.toFixed(2)}: ${candidateWords.map(w => w.text).join(' ')}`);
            }
        }
        
        this._log(`Final best match: ${bestMatch.map(w => w.text).join(' ')} (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    /**
     * Check if two words match (with fuzzy matching)
     * @private
     */
    _wordsMatch(word1, word2) {
        const w1 = word1.toLowerCase().replace(/[^\w]/g, '');
        const w2 = word2.toLowerCase().replace(/[^\w]/g, '');
        
        // Exact match
        if (w1 === w2) return true;
        
        // For very short search terms (like "DE"), be more restrictive
        if (w2.length <= 2) {
            // Only match if the word contains the search term as a complete substring
            // and the word is reasonably short (to avoid matching "Dresden" for "DE")
            return w1.includes(w2) && w1.length <= w2.length + 3;
        }
        
        // Partial match (one contains the other) for longer terms
        if (w1.includes(w2) || w2.includes(w1)) return true;
        
        // For very short words, require exact match
        if (w1.length <= 2) return false;
        
        // Fuzzy similarity for longer words
        return this._calculateWordSimilarity(w1, w2) > 0.8;
    }

    /**
     * Calculate similarity between two words
     * @private
     */
    _calculateWordSimilarity(word1, word2) {
        const len1 = word1.length;
        const len2 = word2.length;
        const maxLen = Math.max(len1, len2);
        
        if (maxLen === 0) return 1.0;
        
        // Simple character overlap ratio
        let matches = 0;
        const minLen = Math.min(len1, len2);
        
        for (let i = 0; i < minLen; i++) {
            if (word1[i] === word2[i]) matches++;
        }
        
        return matches / maxLen;
    }

    /**
     * Extract bounding box coordinates from title attribute
     * @private
     */
    _extractBoundingBox(element) {
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
     * Logging utility
     * @private
     */
    _log(message, ...args) {
        if (this.config.debugMode) {
            console.log(`[TextHighlighter] ${message}`, ...args);
        }
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    console.log('TextHighlighter module loaded');
    console.log('Ready for browser usage with multi-line text highlighting support');
}