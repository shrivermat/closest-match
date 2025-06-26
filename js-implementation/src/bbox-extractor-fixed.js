/**
 * Fixed Bounding Box Extractor - Uses word-level coordinates
 * This version extracts coordinates from individual word bounding boxes
 * instead of line-level markers, which is more accurate for text spans
 */

export class BoundingBoxExtractor {
    /**
     * Extract bounding box coordinates for a matched text string
     * This version uses the original hOCR content to find word-level bounding boxes
     * @param {string} hocrContent - Original hOCR HTML content
     * @param {string} embeddedText - Text with embedded LINE markers (for text matching)
     * @param {string} matchedText - The matched text to find coordinates for
     * @param {number} startIndex - Start index of match in embedded text
     * @param {number} endIndex - End index of match in embedded text
     * @returns {Object|null} Bounding box coordinates or null
     */
    extractBoundingBox(hocrContent, embeddedText, matchedText, startIndex = -1, endIndex = -1) {
        if (!hocrContent || !matchedText) {
            return null;
        }
        
        // Parse hOCR to find word-level bounding boxes
        const wordBoxes = this._extractWordBoundingBoxes(hocrContent);
        
        if (wordBoxes.length === 0) {
            console.warn('No word bounding boxes found in hOCR');
            return null;
        }
        
        // Clean the matched text for comparison
        const cleanedMatchText = matchedText.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
        const matchWords = cleanedMatchText.split(/\s+/).filter(w => w.length > 0);
        
        if (matchWords.length === 0) {
            return null;
        }
        
        // Find the sequence of words that matches our search text
        const matchingWordBoxes = this._findMatchingWordSequence(wordBoxes, matchWords);
        
        if (matchingWordBoxes.length === 0) {
            console.warn('No matching word sequence found');
            return null;
        }
        
        // Calculate bounding box from matching words
        return this._calculateBoundingBoxFromWords(matchingWordBoxes);
    }
    
    /**
     * Extract all word bounding boxes from hOCR content
     * @private
     */
    _extractWordBoundingBoxes(hocrContent) {
        const wordBoxes = [];
        
        // Use regex to find all word elements with bounding boxes
        const wordRegex = /<span[^>]*class=['"]ocrx_word['"][^>]*title=['"]([^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))[^'"]*['"][^>]*>([^<]*)<\/span>/g;
        
        let match;
        while ((match = wordRegex.exec(hocrContent)) !== null) {
            const x1 = parseInt(match[2], 10);
            const y1 = parseInt(match[3], 10);
            const x2 = parseInt(match[4], 10);
            const y2 = parseInt(match[5], 10);
            const text = match[6].replace(/<[^>]*>/g, '').trim(); // Remove any inner HTML tags
            
            if (text && x1 >= 0 && y1 >= 0 && x2 > x1 && y2 > y1) {
                wordBoxes.push({
                    text: text,
                    cleanText: text.toLowerCase().replace(/[^\w]/g, ''),
                    x1: x1,
                    y1: y1,
                    x2: x2,
                    y2: y2
                });
            }
        }
        
        console.log(`Extracted ${wordBoxes.length} word bounding boxes`);
        return wordBoxes;
    }
    
    /**
     * Find the sequence of words that matches the search text
     * @private
     */
    _findMatchingWordSequence(wordBoxes, searchWords) {
        const cleanSearchWords = searchWords.map(w => w.toLowerCase().replace(/[^\w]/g, ''));
        
        // Try different starting positions
        for (let startIdx = 0; startIdx <= wordBoxes.length - cleanSearchWords.length; startIdx++) {
            const candidateWords = [];
            let searchWordIdx = 0;
            
            // Try to match the sequence starting from this position
            for (let i = startIdx; i < wordBoxes.length && searchWordIdx < cleanSearchWords.length; i++) {
                const wordBox = wordBoxes[i];
                const searchWord = cleanSearchWords[searchWordIdx];
                
                // Check if this word matches the current search word
                if (wordBox.cleanText === searchWord || 
                    wordBox.cleanText.includes(searchWord) ||
                    searchWord.includes(wordBox.cleanText)) {
                    
                    candidateWords.push(wordBox);
                    searchWordIdx++;
                } else if (candidateWords.length > 0) {
                    // We were in a sequence but it broke - try partial matches
                    // Allow for some flexibility in matching
                    const similarity = this._calculateWordSimilarity(wordBox.cleanText, searchWord);
                    if (similarity > 0.7) {
                        candidateWords.push(wordBox);
                        searchWordIdx++;
                    } else {
                        // Sequence broken, reset if we haven't found a good match yet
                        if (searchWordIdx < cleanSearchWords.length * 0.5) {
                            break;
                        }
                    }
                }
            }
            
            // Check if we found a good match (at least 70% of words matched)
            if (searchWordIdx >= cleanSearchWords.length * 0.7) {
                console.log(`Found matching sequence: ${candidateWords.map(w => w.text).join(' ')}`);
                return candidateWords;
            }
        }
        
        // If exact matching failed, try fuzzy matching
        return this._fuzzyMatchWordSequence(wordBoxes, searchWords);
    }
    
    /**
     * Fuzzy matching for word sequences
     * @private
     */
    _fuzzyMatchWordSequence(wordBoxes, searchWords) {
        const cleanSearchWords = searchWords.map(w => w.toLowerCase().replace(/[^\w]/g, ''));
        const searchText = cleanSearchWords.join('');
        
        let bestMatch = [];
        let bestScore = 0;
        
        // Try different window sizes around the expected length
        for (let windowSize = Math.max(1, cleanSearchWords.length - 2); 
             windowSize <= cleanSearchWords.length + 3; 
             windowSize++) {
            
            for (let startIdx = 0; startIdx <= wordBoxes.length - windowSize; startIdx++) {
                const window = wordBoxes.slice(startIdx, startIdx + windowSize);
                const windowText = window.map(w => w.cleanText).join('');
                
                const similarity = this._calculateTextSimilarity(windowText, searchText);
                
                if (similarity > bestScore && similarity > 0.6) {
                    bestScore = similarity;
                    bestMatch = window;
                }
            }
        }
        
        if (bestMatch.length > 0) {
            console.log(`Found fuzzy match (${(bestScore * 100).toFixed(1)}%): ${bestMatch.map(w => w.text).join(' ')}`);
        }
        
        return bestMatch;
    }
    
    /**
     * Calculate bounding box from a list of word boxes
     * @private
     */
    _calculateBoundingBoxFromWords(wordBoxes) {
        if (wordBoxes.length === 0) {
            return null;
        }
        
        // Find the minimum and maximum coordinates
        let minX = Math.min(...wordBoxes.map(w => w.x1));
        let minY = Math.min(...wordBoxes.map(w => w.y1));
        let maxX = Math.max(...wordBoxes.map(w => w.x2));
        let maxY = Math.max(...wordBoxes.map(w => w.y2));
        
        console.log(`Calculated bounding box from ${wordBoxes.length} words: [${minX}, ${minY}, ${maxX}, ${maxY}]`);
        console.log(`Words: ${wordBoxes.map(w => w.text).join(' ')}`);
        
        return {
            x1: minX,
            y1: minY,
            x2: maxX,
            y2: maxY
        };
    }
    
    /**
     * Calculate similarity between two words
     * @private
     */
    _calculateWordSimilarity(word1, word2) {
        if (word1 === word2) return 1.0;
        if (word1.includes(word2) || word2.includes(word1)) return 0.8;
        
        // Simple character-based similarity
        const chars1 = word1.split('');
        const chars2 = word2.split('');
        const matching = chars1.filter(c => chars2.includes(c)).length;
        return matching / Math.max(chars1.length, chars2.length);
    }
    
    /**
     * Calculate similarity between two text strings
     * @private
     */
    _calculateTextSimilarity(text1, text2) {
        if (text1 === text2) return 1.0;
        
        const len1 = text1.length;
        const len2 = text2.length;
        const maxLen = Math.max(len1, len2);
        
        if (maxLen === 0) return 1.0;
        
        // Calculate character overlap
        let matching = 0;
        const minLen = Math.min(len1, len2);
        for (let i = 0; i < minLen; i++) {
            if (text1[i] === text2[i]) matching++;
        }
        
        return matching / maxLen;
    }
    
    // Backward compatibility method that works with embedded text
    extractBoundingBoxFromEmbedded(embeddedText, matchedText, startIndex = -1, endIndex = -1) {
        console.warn('extractBoundingBoxFromEmbedded is deprecated, use extractBoundingBox with hOCR content');
        
        // Fallback to old method for now
        const lineRegex = /\[\[LINE (\d+) (\d+) (\d+) (\d+)\]\]/g;
        
        if (startIndex === -1 || endIndex === -1) {
            const matchPosition = this._findMatchPositionInEmbedded(embeddedText, matchedText);
            if (!matchPosition) return null;
            startIndex = matchPosition.startIndex;
            endIndex = matchPosition.endIndex;
        }
        
        const beforeMatch = embeddedText.substring(0, startIndex);
        const matchSection = embeddedText.substring(startIndex, endIndex);
        
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        
        // Get starting coordinates from last LINE before match
        const beforeMatches = [...beforeMatch.matchAll(lineRegex)];
        if (beforeMatches.length > 0) {
            const lastMatch = beforeMatches[beforeMatches.length - 1];
            x1 = parseInt(lastMatch[1], 10);
            y1 = parseInt(lastMatch[2], 10);
        }
        
        // Get ending coordinates from LINEs within match
        x2 = x1;
        const matchMatches = [...matchSection.matchAll(lineRegex)];
        for (const match of matchMatches) {
            const currentX2 = parseInt(match[3], 10);
            const currentY2 = parseInt(match[4], 10);
            if (currentX2 > x2) x2 = currentX2;
            y2 = currentY2;
        }
        
        return (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) ? null : { x1, y1, x2, y2 };
    }
    
    _findMatchPositionInEmbedded(embeddedText, matchedText) {
        const cleanedEmbedded = embeddedText.replace(/\[\[.*?\]\] /g, '');
        const cleanedIndex = cleanedEmbedded.indexOf(matchedText.trim());
        
        if (cleanedIndex === -1) return null;
        
        // Map back to original text - simplified version
        let originalIndex = 0;
        let cleanedPos = 0;
        
        while (originalIndex < embeddedText.length && cleanedPos < cleanedIndex) {
            if (embeddedText.substring(originalIndex).startsWith('[[')) {
                const markerEnd = embeddedText.indexOf(']]', originalIndex) + 2;
                originalIndex = markerEnd;
                if (embeddedText[originalIndex] === ' ') originalIndex++;
            } else {
                originalIndex++;
                cleanedPos++;
            }
        }
        
        return {
            startIndex: originalIndex,
            endIndex: originalIndex + matchedText.length
        };
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    console.log('Fixed Bounding Box Extractor module loaded');
}