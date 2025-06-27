use wasm_bindgen::prelude::*;
use std::cmp;

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct MatchResult {
    #[wasm_bindgen(skip)]
    text: String,
    pub similarity: f64,
    pub start_index: usize,
    pub end_index: usize,
    #[wasm_bindgen(skip)]
    pub debug_cleaned_text: String,
    #[wasm_bindgen(skip)]
    pub debug_search_words: String,
    pub debug_cleaned_word_count: usize,
    pub debug_search_word_count: usize,
}

#[wasm_bindgen]
impl MatchResult {
    #[wasm_bindgen(getter)]
    pub fn text(&self) -> String {
        self.text.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn debug_cleaned_text(&self) -> String {
        self.debug_cleaned_text.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn debug_search_words(&self) -> String {
        self.debug_search_words.clone()
    }
}

/// Calculate sequence similarity between two sequences of words
/// Ported from Python closest_match.py:sequence_similarity()
pub fn sequence_similarity(seq1: &[&str], seq2: &[&str]) -> f64 {
    if seq1.is_empty() && seq2.is_empty() {
        return 1.0;
    }
    
    let matching_chars = seq1.iter()
        .zip(seq2.iter())
        .filter(|(a, b)| a == b)
        .count();
    
    let max_len = cmp::max(seq1.len(), seq2.len());
    matching_chars as f64 / max_len as f64
}

/// Calculate fuzzy similarity between two words
fn calculate_word_similarity(word1: &str, word2: &str) -> f64 {
    if word1 == word2 {
        return 1.0;
    }
    if word1.contains(word2) || word2.contains(word1) {
        return 0.8;
    }
    
    // Simple character-based similarity
    let chars1: Vec<char> = word1.chars().collect();
    let chars2: Vec<char> = word2.chars().collect();
    let matching = chars1.iter().filter(|c| chars2.contains(c)).count();
    matching as f64 / cmp::max(chars1.len(), chars2.len()) as f64
}

/// Enhanced sequence similarity with fuzzy word matching
fn fuzzy_sequence_similarity(seq1: &[&str], seq2: &[&str]) -> f64 {
    if seq1.is_empty() && seq2.is_empty() {
        return 1.0;
    }
    if seq1.is_empty() || seq2.is_empty() {
        return 0.0;
    }
    
    let mut total_similarity = 0.0;
    let max_len = cmp::max(seq1.len(), seq2.len());
    
    for i in 0..max_len {
        if i < seq1.len() && i < seq2.len() {
            total_similarity += calculate_word_similarity(seq1[i], seq2[i]);
        }
    }
    
    total_similarity / max_len as f64
}

/// Calculate text similarity between two text strings (character-based)
fn calculate_text_similarity(text1: &str, text2: &str) -> f64 {
    if text1 == text2 {
        return 1.0;
    }
    
    let len1 = text1.len();
    let len2 = text2.len();
    let max_len = cmp::max(len1, len2);
    
    if max_len == 0 {
        return 1.0;
    }
    
    // Calculate character overlap
    let mut matching = 0;
    let min_len = cmp::min(len1, len2);
    let chars1: Vec<char> = text1.chars().collect();
    let chars2: Vec<char> = text2.chars().collect();
    
    for i in 0..min_len {
        if chars1[i] == chars2[i] {
            matching += 1;
        }
    }
    
    matching as f64 / max_len as f64
}

/// Find fuzzy matches using enhanced similarity algorithms
fn find_fuzzy_match(
    cleaned_words: &[&str], 
    search_words: &[&str], 
    debug_cleaned_text: &str,
    debug_search_words: &str,
    debug_cleaned_word_count: usize,
    debug_search_word_count: usize
) -> Option<MatchResult> {
    let mut best_match: Option<MatchResult> = None;
    let mut best_similarity = 0.0;
    
    // Try different window sizes around the expected length
    let min_window = cmp::max(1, search_words.len().saturating_sub(2));
    let max_window = cmp::min(cleaned_words.len(), search_words.len() + 3);
    
    for window_size in min_window..=max_window {
        for i in 0..=cleaned_words.len().saturating_sub(window_size) {
            let window = &cleaned_words[i..i + window_size];
            
            // Try both fuzzy word matching and character-based matching
            let fuzzy_similarity = fuzzy_sequence_similarity(window, search_words);
            let char_similarity = calculate_text_similarity(&window.join(""), &search_words.join(""));
            
            // Use the better of the two similarity scores
            let similarity = cmp::max(
                (fuzzy_similarity * 1000.0) as i32,
                (char_similarity * 1000.0) as i32
            ) as f64 / 1000.0;
            
            if similarity > best_similarity && similarity > 0.6 {
                best_similarity = similarity;
                let matched_text = window.join(" ");
                
                best_match = Some(MatchResult {
                    text: matched_text,
                    similarity,
                    start_index: i,
                    end_index: i + window_size,
                    debug_cleaned_text: debug_cleaned_text.to_string(),
                    debug_search_words: debug_search_words.to_string(),
                    debug_cleaned_word_count,
                    debug_search_word_count,
                });
            }
        }
    }
    
    best_match
}

/// Clean embedded text by removing hOCR markers
/// Ported from Python closest_match.py logic
fn clean_embedded_text(text: &str) -> String {
    // Remove content between [[ and ]]  
    match regex::Regex::new(r"\[\[.*?\]\] ") {
        Ok(re) => re.replace_all(text, "").to_string(),
        Err(_) => text.to_string(), // Fallback to original text if regex fails
    }
}

/// Find the closest match for a search string in embedded text
/// Ported from Python closest_match.py:find_closest_match()
#[wasm_bindgen]
pub fn find_closest_match(embedded_text: &str, search_string: &str) -> Option<MatchResult> {
    // Add safety checks
    if embedded_text.is_empty() || search_string.is_empty() {
        return None;
    }
    
    // Clean the embedded text by removing hOCR markers
    let cleaned_text = clean_embedded_text(embedded_text);
    let cleaned_words: Vec<&str> = cleaned_text.split_whitespace().collect();
    let search_words: Vec<&str> = search_string.split_whitespace().collect();
    
    // Prepare debug information
    let debug_cleaned_text = cleaned_text.chars().take(500).collect::<String>(); // First 500 chars
    let debug_search_words = search_words.join(" ");
    let debug_cleaned_word_count = cleaned_words.len();
    let debug_search_word_count = search_words.len();
    
    if search_words.is_empty() || cleaned_words.is_empty() {
        return None;
    }
    
    // Additional safety check for window size
    if search_words.len() > cleaned_words.len() {
        return None;
    }
    
    let window_size = search_words.len();
    let mut best_match: Option<MatchResult> = None;
    let mut best_similarity = 0.0;
    
    // Sliding window approach with exact matching first
    for i in 0..=cleaned_words.len().saturating_sub(window_size) {
        let window = &cleaned_words[i..i + window_size];
        let similarity = sequence_similarity(window, &search_words);
        
        if similarity > best_similarity {
            best_similarity = similarity;
            let matched_text = window.join(" ");
            
            best_match = Some(MatchResult {
                text: matched_text,
                similarity,
                start_index: i,
                end_index: i + window_size,
                debug_cleaned_text: debug_cleaned_text.clone(),
                debug_search_words: debug_search_words.clone(),
                debug_cleaned_word_count,
                debug_search_word_count,
            });
            
            // Early exit for high similarity matches (performance optimization)
            if similarity >= 0.95 {
                break;
            }
        }
    }
    
    // If exact matching didn't find a good match, try fuzzy matching
    if best_similarity < 0.8 {
        if let Some(fuzzy_match) = find_fuzzy_match(&cleaned_words, &search_words, &debug_cleaned_text, &debug_search_words, debug_cleaned_word_count, debug_search_word_count) {
            if fuzzy_match.similarity > best_similarity {
                best_match = Some(fuzzy_match);
            }
        }
    }
    
    best_match
}

/// Find multiple matches for a list of search strings
/// Returns all matches above the similarity threshold
#[wasm_bindgen]
pub fn find_multiple_matches(
    embedded_text: &str, 
    search_strings: &js_sys::Array,
    similarity_threshold: f64
) -> js_sys::Array {
    let results = js_sys::Array::new();
    
    for i in 0..search_strings.length() {
        if let Some(search_str) = search_strings.get(i).as_string() {
            if let Some(match_result) = find_closest_match(embedded_text, &search_str) {
                if match_result.similarity >= similarity_threshold {
                    let js_result = js_sys::Object::new();
                    js_sys::Reflect::set(&js_result, &"text".into(), &match_result.text.into()).unwrap();
                    js_sys::Reflect::set(&js_result, &"similarity".into(), &match_result.similarity.into()).unwrap();
                    js_sys::Reflect::set(&js_result, &"startIndex".into(), &(match_result.start_index as u32).into()).unwrap();
                    js_sys::Reflect::set(&js_result, &"endIndex".into(), &(match_result.end_index as u32).into()).unwrap();
                    js_sys::Reflect::set(&js_result, &"searchQuery".into(), &search_str.into()).unwrap();
                    
                    results.push(&js_result);
                }
            }
        }
    }
    
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_similarity() {
        let seq1 = vec!["hello", "world"];
        let seq2 = vec!["hello", "world"];
        assert_eq!(sequence_similarity(&seq1, &seq2), 1.0);
        
        let seq1 = vec!["hello", "world"];
        let seq2 = vec!["hello", "universe"];
        assert_eq!(sequence_similarity(&seq1, &seq2), 0.5);
    }

    #[test]
    fn test_find_closest_match() {
        let embedded_text = "[[PARAGRAPH]] [[LINE 100 200 300 400]] hello world test [[LINE 500 600 700 800]] another line";
        let search_string = "hello world";
        
        let result = find_closest_match(embedded_text, search_string);
        assert!(result.is_some());
        
        let match_result = result.unwrap();
        assert_eq!(match_result.text, "hello world");
        assert_eq!(match_result.similarity, 1.0);
    }
}