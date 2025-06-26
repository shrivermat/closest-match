/**
 * Text Matching Algorithm - Pure JavaScript Implementation
 * Ported from Python closest_match.py
 */

export class TextMatcher {
    /**
     * Calculate sequence similarity between two word arrays
     * @param {string[]} seq1 - First sequence of words
     * @param {string[]} seq2 - Second sequence of words
     * @returns {number} Similarity score between 0 and 1
     */
    sequenceSimilarity(seq1, seq2) {
        const maxLength = Math.max(seq1.length, seq2.length);
        if (maxLength === 0) return 1.0;
        
        const matches = seq1.reduce((count, word, index) => {
            return seq2[index] === word ? count + 1 : count;
        }, 0);
        
        return matches / maxLength;
    }
    
    /**
     * Find the closest matching text using sliding window approach
     * @param {string} embeddedText - Text with embedded LINE markers from hOCR
     * @param {string} searchString - Text to search for
     * @returns {Object} Match result with text, similarity, and indices
     */
    findClosestMatch(embeddedText, searchString) {
        if (!embeddedText || !searchString) {
            return { text: '', similarity: 0, startIndex: -1, endIndex: -1 };
        }
        
        // Clean the embedded text by removing hOCR markers
        const cleanedText = embeddedText.replace(/\[\[.*?\]\] /g, '');
        const cleanedWords = cleanedText.split(/\s+/).filter(word => word.length > 0);
        const searchWords = searchString.split(/\s+/).filter(word => word.length > 0);
        
        if (searchWords.length === 0) {
            return { text: '', similarity: 0, startIndex: -1, endIndex: -1 };
        }
        
        const windowSize = searchWords.length;
        let bestMatch = {
            text: '',
            similarity: 0,
            startIndex: -1,
            endIndex: -1,
            cleanedStartIndex: -1,
            cleanedEndIndex: -1
        };
        
        // Sliding window approach
        for (let i = 0; i <= cleanedWords.length - windowSize; i++) {
            const windowWords = cleanedWords.slice(i, i + windowSize);
            const similarity = this.sequenceSimilarity(windowWords, searchWords);
            
            if (similarity > bestMatch.similarity) {
                bestMatch = {
                    text: windowWords.join(' '),
                    similarity: similarity,
                    startIndex: -1, // Will calculate later for original text
                    endIndex: -1,   // Will calculate later for original text
                    cleanedStartIndex: i,
                    cleanedEndIndex: i + windowSize
                };
                
                // Early exit for perfect match
                if (similarity >= 0.95) {
                    break;
                }
            }
        }
        
        // Map cleaned text indices back to original text with markers
        if (bestMatch.similarity > 0) {
            const { startIndex, endIndex } = this._mapIndicesToOriginalText(
                embeddedText, cleanedText, bestMatch.cleanedStartIndex, bestMatch.cleanedEndIndex
            );
            bestMatch.startIndex = startIndex;
            bestMatch.endIndex = endIndex;
        }
        
        return bestMatch;
    }
    
    /**
     * Map word indices from cleaned text back to original text with markers
     * @private
     */
    _mapIndicesToOriginalText(originalText, cleanedText, cleanedStartIndex, cleanedEndIndex) {
        const cleanedWords = cleanedText.split(/\s+/).filter(word => word.length > 0);
        const targetStartWord = cleanedWords[cleanedStartIndex];
        const targetEndWord = cleanedWords[cleanedEndIndex - 1];
        
        // Find the word positions in original text
        let wordCount = 0;
        let startIndex = -1;
        let endIndex = -1;
        
        // Split original text into tokens (words and markers)
        const tokens = originalText.split(/(\s+|\[\[.*?\]\])/);
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Skip whitespace and markers
            if (!token || /^\s+$/.test(token) || /^\[\[.*?\]\]$/.test(token)) {
                continue;
            }
            
            // This is a word
            if (wordCount === cleanedStartIndex && token === targetStartWord) {
                startIndex = originalText.indexOf(token, i === 0 ? 0 : 
                    originalText.indexOf(tokens.slice(0, i).join('')));
            }
            
            if (wordCount === cleanedEndIndex - 1 && token === targetEndWord) {
                const tokenStart = originalText.indexOf(token, startIndex >= 0 ? startIndex : 0);
                endIndex = tokenStart + token.length;
                break;
            }
            
            wordCount++;
        }
        
        return { startIndex, endIndex };
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    // Node.js environment - run basic tests
    const matcher = new TextMatcher();
    
    // Test 1: Basic matching
    const testText = "[[PARAGRAPH]] [[LINE 100 200 300 400]] Hello world this is test [[LINE 400 200 600 400]] text for matching";
    const searchText = "this is test";
    const result = matcher.findClosestMatch(testText, searchText);
    
    console.log('Test 1 - Basic matching:');
    console.log('Result:', result);
    console.log('Expected similarity > 0.8:', result.similarity > 0.8);
    console.log('');
    
    // Test 2: Sequence similarity
    const seq1 = ['hello', 'world', 'test'];
    const seq2 = ['hello', 'world', 'test'];
    const similarity = matcher.sequenceSimilarity(seq1, seq2);
    console.log('Test 2 - Perfect sequence similarity:');
    console.log('Similarity:', similarity);
    console.log('Expected 1.0:', similarity === 1.0);
}