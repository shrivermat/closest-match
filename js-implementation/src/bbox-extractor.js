/**
 * Bounding Box Extractor - Pure JavaScript Implementation  
 * Ported from Python extract_box.py algorithm
 */

export class BoundingBoxExtractor {
    /**
     * Extract bounding box coordinates for a matched text string
     * @param {string} embeddedText - Text with embedded LINE markers
     * @param {string} matchedText - The matched text to find coordinates for
     * @param {number} startIndex - Start index of match in embedded text
     * @param {number} endIndex - End index of match in embedded text
     * @returns {Object|null} Bounding box coordinates or null
     */
    extractBoundingBox(embeddedText, matchedText, startIndex = -1, endIndex = -1) {
        if (!embeddedText || !matchedText) {
            return null;
        }
        
        // If indices not provided, find the match in the text
        if (startIndex === -1 || endIndex === -1) {
            const matchPosition = this._findMatchPosition(embeddedText, matchedText);
            if (!matchPosition) return null;
            startIndex = matchPosition.startIndex;
            endIndex = matchPosition.endIndex;
        }
        
        // Extract the sections before, during, and after the match
        const beforeMatch = embeddedText.substring(0, startIndex);
        const matchSection = embeddedText.substring(startIndex, endIndex);
        
        // Find LINE markers using regex
        const lineRegex = /\[\[LINE (\d+) (\d+) (\d+) (\d+)\]\]/g;
        
        // Get starting coordinates from the last LINE marker before the match
        let x1 = 0, y1 = 0;
        const beforeMatches = [...beforeMatch.matchAll(lineRegex)];
        if (beforeMatches.length > 0) {
            const lastBeforeMatch = beforeMatches[beforeMatches.length - 1];
            x1 = parseInt(lastBeforeMatch[1], 10);
            y1 = parseInt(lastBeforeMatch[2], 10);
        }
        
        // Get ending coordinates from LINE markers within the match
        // Following Python logic: find max x2 and final y2
        let x2 = x1; // Initialize with starting x
        let y2 = y1; // Initialize with starting y
        
        const matchLineMatches = [...matchSection.matchAll(lineRegex)];
        
        for (const match of matchLineMatches) {
            const currentX2 = parseInt(match[3], 10);
            const currentY2 = parseInt(match[4], 10);
            
            // Find maximum x2 (rightmost coordinate)
            if (currentX2 > x2) {
                x2 = currentX2;
            }
            
            // Always update y2 to the last line's bottom coordinate
            y2 = currentY2;
        }
        
        // Return null if no valid coordinates found
        if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) {
            return null;
        }
        
        return {
            x1: x1,
            y1: y1, 
            x2: x2,
            y2: y2
        };
    }
    
    /**
     * Find the position of matched text in embedded text using sliding window
     * Similar to the approach in text-matcher.js but focused on finding exact position
     * @private
     */
    _findMatchPosition(embeddedText, matchedText) {
        // Clean both texts for comparison
        const cleanedEmbedded = embeddedText.replace(/\[\[.*?\]\] /g, '');
        const cleanedMatched = matchedText.trim();
        
        // Simple substring search first
        const cleanedIndex = cleanedEmbedded.indexOf(cleanedMatched);
        if (cleanedIndex !== -1) {
            // Map back to original text with markers
            return this._mapCleanedIndexToOriginal(embeddedText, cleanedEmbedded, 
                cleanedIndex, cleanedIndex + cleanedMatched.length);
        }
        
        // If exact match fails, use word-based fuzzy matching
        return this._fuzzyFindPosition(embeddedText, matchedText);
    }
    
    /**
     * Map cleaned text indices back to original text with markers
     * @private
     */
    _mapCleanedIndexToOriginal(originalText, cleanedText, cleanedStart, cleanedEnd) {
        let originalIndex = 0;
        let cleanedIndex = 0;
        let startIndex = -1;
        let endIndex = -1;
        
        while (originalIndex < originalText.length && cleanedIndex < cleanedText.length) {
            // Check for marker
            if (originalText.substring(originalIndex).startsWith('[[')) {
                // Skip marker
                const markerEnd = originalText.indexOf(']]', originalIndex) + 2;
                originalIndex = markerEnd;
                // Skip space after marker if present
                if (originalText[originalIndex] === ' ') {
                    originalIndex++;
                }
                continue;
            }
            
            // Check if we've reached the start position
            if (cleanedIndex === cleanedStart && startIndex === -1) {
                startIndex = originalIndex;
            }
            
            // Check if we've reached the end position
            if (cleanedIndex === cleanedEnd) {
                endIndex = originalIndex;
                break;
            }
            
            originalIndex++;
            cleanedIndex++;
        }
        
        if (startIndex !== -1 && endIndex === -1) {
            endIndex = originalIndex;
        }
        
        return startIndex !== -1 ? { startIndex, endIndex } : null;
    }
    
    /**
     * Fuzzy position finding using word-based matching
     * @private
     */
    _fuzzyFindPosition(embeddedText, matchedText) {
        const cleanedEmbedded = embeddedText.replace(/\[\[.*?\]\] /g, '');
        const embeddedWords = cleanedEmbedded.split(/\s+/);
        const matchedWords = matchedText.split(/\s+/);
        
        // Find best word sequence match
        let bestScore = 0;
        let bestStart = -1;
        let bestEnd = -1;
        
        for (let i = 0; i <= embeddedWords.length - matchedWords.length; i++) {
            const windowWords = embeddedWords.slice(i, i + matchedWords.length);
            const score = this._calculateWordSimilarity(windowWords, matchedWords);
            
            if (score > bestScore) {
                bestScore = score;
                bestStart = i;
                bestEnd = i + matchedWords.length;
            }
        }
        
        if (bestScore > 0.7) {
            // Map word indices to character indices
            const beforeWords = embeddedWords.slice(0, bestStart);
            const matchWords = embeddedWords.slice(bestStart, bestEnd);
            
            const cleanedStart = beforeWords.join(' ').length + (beforeWords.length > 0 ? 1 : 0);
            const cleanedEnd = cleanedStart + matchWords.join(' ').length;
            
            return this._mapCleanedIndexToOriginal(embeddedText, cleanedEmbedded, cleanedStart, cleanedEnd);
        }
        
        return null;
    }
    
    /**
     * Calculate similarity between word arrays
     * @private
     */
    _calculateWordSimilarity(words1, words2) {
        const maxLength = Math.max(words1.length, words2.length);
        if (maxLength === 0) return 1.0;
        
        const matches = words1.reduce((count, word, index) => {
            return words2[index] === word ? count + 1 : count;
        }, 0);
        
        return matches / maxLength;
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    // Node.js environment - run basic tests
    const extractor = new BoundingBoxExtractor();
    
    // Test with sample embedded text
    const testEmbedded = `[[PARAGRAPH]] [[LINE 100 200 300 250]] Hello world [[LINE 100 260 400 310]] this is test [[LINE 100 320 350 370]] text for testing`;
    const testMatch = "this is test";
    
    console.log('Bounding Box Extractor Test:');
    const bbox = extractor.extractBoundingBox(testEmbedded, testMatch);
    console.log('Result:', bbox);
    console.log('Has coordinates:', bbox && bbox.x1 >= 0 && bbox.y1 >= 0);
    
    // Test with specific indices
    const startIndex = testEmbedded.indexOf('this is test');
    const endIndex = startIndex + testMatch.length;
    const bbox2 = extractor.extractBoundingBox(testEmbedded, testMatch, startIndex, endIndex);
    console.log('With indices:', bbox2);
}