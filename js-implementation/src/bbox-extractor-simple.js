/**
 * Simple Bounding Box Extractor - Direct Python Port
 * Follows the exact algorithm from extract_box.py
 */

export class BoundingBoxExtractor {
    /**
     * Calculate sequence similarity (direct port from Python)
     */
    sequenceSimilarity(seq1, seq2) {
        const maxLength = Math.max(seq1.length, seq2.length);
        if (maxLength === 0) return 1.0;
        
        let matches = 0;
        const minLength = Math.min(seq1.length, seq2.length);
        for (let i = 0; i < minLength; i++) {
            if (seq1[i] === seq2[i]) {
                matches++;
            }
        }
        
        return matches / maxLength;
    }
    
    /**
     * Extract bounding box using character-level sliding window (direct Python port)
     * @param {string} embeddedText - Text with embedded LINE markers
     * @param {string} closestMatchString - The matched text to find coordinates for
     * @returns {Object|null} Bounding box coordinates or null
     */
    extractBoundingBox(embeddedText, closestMatchString) {
        if (!embeddedText || !closestMatchString) {
            return null;
        }
        
        console.log('Extracting bounding box for:', closestMatchString);
        console.log('Embedded text length:', embeddedText.length);
        
        // Direct port of Python algorithm
        let bestSimilarity = 0;
        let bestMatch = null;
        let bestStartIndex = null;
        let bestEndIndex = null;
        
        const searchLength = closestMatchString.length;
        
        // Character-level sliding window from end to beginning (like Python)
        for (let endIndex = embeddedText.length; endIndex >= searchLength; endIndex--) {
            let startIndex = endIndex - searchLength;
            
            // Adjust start index to account for removed markers (like Python)
            while (true) {
                const windowText = embeddedText.substring(startIndex, endIndex);
                const cleanedWindow = windowText.replace(/\[\[.*?\]\] /g, ''); // Remove markers
                
                if (cleanedWindow.length >= searchLength) {
                    break;
                }
                startIndex -= (searchLength - cleanedWindow.length);
                
                // Prevent infinite loop
                if (startIndex < 0) {
                    startIndex = 0;
                    break;
                }
            }
            
            const windowText = embeddedText.substring(startIndex, endIndex);
            const cleanedWindow = windowText.replace(/\[\[.*?\]\] /g, '');
            const similarity = this.sequenceSimilarity(cleanedWindow, closestMatchString);
            
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = cleanedWindow;
                bestStartIndex = startIndex;
                bestEndIndex = endIndex;
            }
            
            // Early exit if similarity is high enough (like Python)
            if (bestSimilarity > 0.85) {
                break;
            }
        }
        
        console.log('Best similarity found:', bestSimilarity);
        console.log('Best match:', bestMatch);
        console.log('Best indices:', bestStartIndex, 'to', bestEndIndex);
        
        if (bestSimilarity === 0 || bestStartIndex === null) {
            console.warn('No good match found');
            return null;
        }
        
        // Extract LINE markers exactly like Python
        let firstNum = 0, secondNum = 0, thirdNum = 0, fourthNum = 0, maxThirdNum = 0;
        
        // Find LINE markers before the match
        const beforeText = embeddedText.substring(0, bestStartIndex);
        const lineRegex = /\[\[LINE .*?\]\]/g;
        const beforeMatches = [...beforeText.matchAll(lineRegex)];
        
        if (beforeMatches.length > 0) {
            const lastMatch = beforeMatches[beforeMatches.length - 1][0];
            const numbers = lastMatch.match(/\d+/g);
            if (numbers && numbers.length >= 4) {
                firstNum = parseInt(numbers[0], 10);
                secondNum = parseInt(numbers[1], 10);
                maxThirdNum = parseInt(numbers[2], 10);
            }
        } else {
            console.warn('No LINE markers found before match');
        }
        
        // Find LINE markers within the match
        const matchText = embeddedText.substring(bestStartIndex, bestEndIndex);
        const endMatches = [...matchText.matchAll(lineRegex)];
        
        if (endMatches.length > 0) {
            // Find maximum third number (x2 coordinate)
            for (const match of endMatches) {
                const numbers = match[0].match(/\d+/g);
                if (numbers && numbers.length >= 3) {
                    const currentThirdNum = parseInt(numbers[2], 10);
                    if (currentThirdNum > maxThirdNum) {
                        maxThirdNum = currentThirdNum;
                    }
                }
            }
            
            // Get fourth number from last match (y2 coordinate)
            const lastEndMatch = endMatches[endMatches.length - 1][0];
            const lastNumbers = lastEndMatch.match(/\d+/g);
            if (lastNumbers && lastNumbers.length >= 4) {
                fourthNum = parseInt(lastNumbers[3], 10);
            }
            thirdNum = maxThirdNum;
        } else {
            console.warn('No LINE markers found within match');
        }
        
        console.log('Extracted coordinates:', [firstNum, secondNum, thirdNum, fourthNum]);
        
        // Return in the same format as Python
        return {
            x1: firstNum,
            y1: secondNum, 
            x2: thirdNum,
            y2: fourthNum
        };
    }
    
    // Backward compatibility methods
    extractBoundingBoxFromEmbedded(embeddedText, matchedText, startIndex = -1, endIndex = -1) {
        return this.extractBoundingBox(embeddedText, matchedText);
    }
}

// Example usage and testing
if (typeof window === 'undefined') {
    console.log('Simple Bounding Box Extractor module loaded (Python port)');
}