use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use regex::Regex;

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WordBox {
    text: String,
    clean_text: String,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
}

#[wasm_bindgen]
impl BoundingBox {
    #[wasm_bindgen(constructor)]
    pub fn new(x1: f64, y1: f64, x2: f64, y2: f64) -> BoundingBox {
        BoundingBox { x1, y1, x2, y2 }
    }
}

/// Debug function to return raw hOCR content (first 2000 chars)
#[wasm_bindgen]
pub fn debug_get_raw_hocr(hocr_content: &str) -> String {
    hocr_content.chars().take(2000).collect()
}

/// Extract embedded text from hOCR content
/// Ported from Python extract_text.py logic
#[wasm_bindgen]
pub fn extract_embedded_text_from_hocr(hocr_content: &str) -> String {
    // This is a simplified version - in production, we'd use a proper HTML parser
    // For now, we'll extract text and preserve LINE markers similar to the Python version
    
    let mut embedded_text = Vec::new();
    
    // Find all paragraph sections
    let par_regex = Regex::new(r#"<p[^>]*class=['"]ocr_par['"][^>]*>"#).unwrap();
    let line_regex = Regex::new(r#"<span[^>]*class=['"]ocr_line['"][^>]*title=['"]([^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))[^'"]*['"][^>]*>"#).unwrap();
    let word_regex = Regex::new(r#"<span[^>]*class=['"]ocrx_word['"][^>]*>([^<]*)</span>"#).unwrap();
    
    // Process each paragraph
    for par_match in par_regex.find_iter(hocr_content) {
        embedded_text.push("[[PARAGRAPH]]".to_string());
        
        // Find the content after this paragraph tag
        let par_end = par_match.end();
        let par_content = &hocr_content[par_end..];
        
        // Find the end of this paragraph
        if let Some(end_p_pos) = par_content.find("</p>") {
            let par_content = &par_content[..end_p_pos];
            
            // Extract lines within this paragraph
            for line_cap in line_regex.captures_iter(par_content) {
                if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (
                    line_cap.get(2),
                    line_cap.get(3), 
                    line_cap.get(4),
                    line_cap.get(5)
                ) {
                    let line_marker = format!("[[LINE {} {} {} {}]]", 
                        x1.as_str(), y1.as_str(), x2.as_str(), y2.as_str());
                    embedded_text.push(line_marker);
                }
            }
            
            // Extract all words within this paragraph
            for word_cap in word_regex.captures_iter(par_content) {
                if let Some(word_text) = word_cap.get(1) {
                    let word = word_text.as_str().trim();
                    if !word.is_empty() {
                        embedded_text.push(word.to_string());
                    }
                }
            }
        }
    }
    
    embedded_text.join(" ")
}

/// Extract bounding box coordinates using word-level coordinates (improved version)
/// This version uses the original hOCR content to find word-level bounding boxes
#[wasm_bindgen]
pub fn extract_bounding_box_from_hocr(hocr_content: &str, closest_match_string: &str) -> Option<BoundingBox> {
    if hocr_content.is_empty() || closest_match_string.is_empty() {
        web_sys::console::log_1(&"Empty input to extract_bounding_box_from_hocr".into());
        return None;
    }
    
    web_sys::console::log_1(&format!("WASM: Extracting bbox for '{}'", closest_match_string).into());
    web_sys::console::log_1(&format!("WASM: hOCR preview: {}", &hocr_content.chars().take(100).collect::<String>()).into());
    
    // Extract word-level bounding boxes from hOCR
    let word_boxes = extract_word_bounding_boxes(hocr_content);
    
    web_sys::console::log_1(&format!("WASM: Found {} word boxes", word_boxes.len()).into());
    if word_boxes.is_empty() {
        web_sys::console::log_1(&"WASM: No word boxes found!".into());
        return None;
    }
    
    // Use JS/Python sliding window approach directly on hOCR text
    web_sys::console::log_1(&format!("WASM: Using JS/Python sliding window approach for '{}'", closest_match_string).into());
    
    // Extract clean text from word boxes (like embedded text with markers)
    let embedded_text = create_embedded_text_from_word_boxes(&word_boxes);
    web_sys::console::log_1(&format!("WASM: Created embedded text: {}", &embedded_text.chars().take(200).collect::<String>()).into());
    
    // Use the same algorithm as JS implementation
    let matching_word_boxes = find_js_style_match(&embedded_text, closest_match_string, &word_boxes);
    
    web_sys::console::log_1(&format!("WASM: Found {} matching boxes", matching_word_boxes.len()).into());
    if matching_word_boxes.is_empty() {
        web_sys::console::log_1(&"WASM: No matching word sequence found!".into());
        return None;
    }
    
    // Calculate bounding box from matching words
    let result = calculate_bounding_box_from_words(&matching_word_boxes);
    if let Some(ref bbox) = result {
        web_sys::console::log_1(&format!("WASM: Final bbox: [{}, {}, {}, {}]", bbox.x1, bbox.y1, bbox.x2, bbox.y2).into());
    }
    result
}

/// Extract bounding box coordinates for a matched string (legacy version using embedded text)
/// Ported from Python extract_box.py logic - using word-level matching like Python
#[wasm_bindgen] 
pub fn extract_bounding_box(embedded_text: &str, closest_match_string: &str) -> Option<BoundingBox> {
    if embedded_text.is_empty() || closest_match_string.is_empty() {
        return None;
    }
    
    // Split into words for matching (following Python approach)
    let text_words: Vec<&str> = embedded_text.split_whitespace().collect();
    let search_words: Vec<&str> = closest_match_string.split_whitespace().collect();
    
    if search_words.is_empty() {
        return None;
    }
    
    let search_length = search_words.len();
    let mut best_similarity = 0.0;
    let mut best_start_index = 0;
    let mut best_end_index = 0;
    
    // Search from end to beginning as in the original Python code
    for end_index in (search_length..=text_words.len()).rev() {
        let start_index = end_index - search_length;
        let window_words = &text_words[start_index..end_index];
        
        // Remove hOCR markers for comparison
        let cleaned_window: Vec<String> = window_words.iter()
            .filter(|word| !word.starts_with("[[") || !word.ends_with("]]"))
            .map(|word| word.to_string())
            .collect();
        
        if cleaned_window.len() >= search_length {
            let window_text = cleaned_window.join(" ");
            let similarity = calculate_string_similarity(&window_text, closest_match_string);
            
            if similarity > best_similarity {
                best_similarity = similarity;
                best_start_index = start_index;
                best_end_index = end_index;
                
                if best_similarity > 0.85 {
                    break;
                }
            }
        }
    }
    
    // Convert word indices back to character indices in the original text
    let mut char_start_index = 0;
    let mut char_end_index = embedded_text.len();
    
    if best_start_index > 0 {
        let words_before: Vec<&str> = text_words[..best_start_index].to_vec();
        char_start_index = words_before.join(" ").len();
        if char_start_index > 0 { char_start_index += 1; } // Add space
    }
    
    if best_end_index < text_words.len() {
        let words_up_to_end: Vec<&str> = text_words[..best_end_index].to_vec();
        char_end_index = words_up_to_end.join(" ").len();
    }
    
    // Extract LINE markers to calculate bounding box coordinates
    let before_match = &embedded_text[..char_start_index];
    let match_section = &embedded_text[char_start_index..char_end_index];
    
    // Find the last LINE marker before the match
    let line_regex = Regex::new(r"\[\[LINE (\d+) (\d+) (\d+) (\d+)\]\]").unwrap();
    
    let mut x1 = 0.0;
    let mut y1 = 0.0;
    let mut x2 = 0.0;
    let mut y2 = 0.0;
    
    // Get starting coordinates from the line before the match
    if let Some(caps) = line_regex.captures_iter(before_match).last() {
        x1 = caps[1].parse().unwrap_or(0.0);
        y1 = caps[2].parse().unwrap_or(0.0);
    }
    
    // Get ending coordinates from lines within the match
    // Following Python logic: find max x2 and final y2
    let mut max_x2 = x1; // Initialize with starting x in case no matches
    for caps in line_regex.captures_iter(match_section) {
        let current_x2: f64 = caps[3].parse().unwrap_or(0.0);
        let current_y2: f64 = caps[4].parse().unwrap_or(0.0);
        
        // Find maximum x2 (rightmost coordinate) across all lines
        if current_x2 > max_x2 {
            max_x2 = current_x2;
        }
        // Always update y2 to the last line's bottom coordinate
        y2 = current_y2;
    }
    
    x2 = max_x2;
    
    // Return None if no valid coordinates found
    if x1 == 0.0 && y1 == 0.0 && x2 == 0.0 && y2 == 0.0 {
        return None;
    }
    
    Some(BoundingBox::new(x1, y1, x2, y2))
}

/// Extract all word bounding boxes from hOCR content
fn extract_word_bounding_boxes(hocr_content: &str) -> Vec<WordBox> {
    let mut word_boxes = Vec::new();
    
    // Use regex to find all word elements with bounding boxes, including nested HTML tags
    let word_regex = Regex::new(r#"<span[^>]*class=['"]ocrx_word['"][^>]*title=['"]([^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))[^'"]*['"][^>]*>(.*?)</span>"#).unwrap();
    
    for caps in word_regex.captures_iter(hocr_content) {
        if let (Some(x1), Some(y1), Some(x2), Some(y2), Some(text)) = (
            caps.get(2),
            caps.get(3),
            caps.get(4),
            caps.get(5),
            caps.get(6)
        ) {
            let x1_val: f64 = x1.as_str().parse().unwrap_or(0.0);
            let y1_val: f64 = y1.as_str().parse().unwrap_or(0.0);
            let x2_val: f64 = x2.as_str().parse().unwrap_or(0.0);
            let y2_val: f64 = y2.as_str().parse().unwrap_or(0.0);
            let raw_text = text.as_str();
            
            // Strip HTML tags using regex (like BeautifulSoup's get_text())
            let html_tag_regex = Regex::new(r"<[^>]+>").unwrap();
            let clean_text_str = html_tag_regex.replace_all(raw_text, "").trim().to_string();
            
            // Create clean version for matching (keep alphanumeric and spaces for debugging)
            let clean_text_for_matching = clean_text_str.to_lowercase();
            
            if !clean_text_str.is_empty() && x1_val >= 0.0 && y1_val >= 0.0 && x2_val > x1_val && y2_val > y1_val {
                word_boxes.push(WordBox {
                    text: clean_text_str.clone(), // Store the clean text without HTML tags
                    clean_text: clean_text_for_matching,
                    x1: x1_val,
                    y1: y1_val,
                    x2: x2_val,
                    y2: y2_val,
                });
            }
        }
    }
    
    word_boxes
}

/// Create embedded text from word boxes (like JS embedded text with LINE markers)
fn create_embedded_text_from_word_boxes(word_boxes: &[WordBox]) -> String {
    let mut embedded_text = String::from("[[PARAGRAPH]] ");
    
    // Add a LINE marker (using first and last word coordinates)
    if !word_boxes.is_empty() {
        let first_word = &word_boxes[0];
        let last_word = &word_boxes[word_boxes.len() - 1];
        embedded_text.push_str(&format!("[[LINE {} {} {} {}]] ", 
            first_word.x1 as i32, first_word.y1 as i32, 
            last_word.x2 as i32, last_word.y2 as i32));
    }
    
    // Add all the word text
    for word_box in word_boxes {
        embedded_text.push_str(&word_box.text);
        embedded_text.push(' ');
    }
    
    embedded_text
}

/// Exact copy of JS TextMatcher.findClosestMatch algorithm
fn find_js_style_match(embedded_text: &str, search_string: &str, word_boxes: &[WordBox]) -> Vec<WordBox> {
    web_sys::console::log_1(&format!("WASM: JS-style matching '{}' in embedded text", search_string).into());
    
    if embedded_text.is_empty() || search_string.is_empty() {
        return Vec::new();
    }
    
    // Clean the embedded text by removing hOCR markers (exact JS logic)
    let regex = Regex::new(r"\[\[.*?\]\] ").unwrap();
    let cleaned_text = regex.replace_all(embedded_text, "").to_string();
    let cleaned_words: Vec<&str> = cleaned_text.split_whitespace().filter(|w| !w.is_empty()).collect();
    let search_words: Vec<&str> = search_string.split_whitespace().filter(|w| !w.is_empty()).collect();
    
    web_sys::console::log_1(&format!("WASM: Cleaned text has {} words", cleaned_words.len()).into());
    web_sys::console::log_1(&format!("WASM: Search has {} words", search_words.len()).into());
    web_sys::console::log_1(&format!("WASM: Search words: {:?}", search_words).into());
    
    if search_words.is_empty() {
        return Vec::new();
    }
    
    let window_size = search_words.len();
    let mut best_cleaned_start_index = 0;
    let mut best_similarity = 0.0;
    
    // Sliding window approach (exact JS logic)
    if window_size <= cleaned_words.len() {
        for i in 0..=(cleaned_words.len() - window_size) {
            let window_words = &cleaned_words[i..i + window_size];
            
            // Calculate sequence similarity (exact JS logic)
            let similarity = js_sequence_similarity(window_words, &search_words);
            
            if similarity > best_similarity {
                best_similarity = similarity;
                best_cleaned_start_index = i;
                
                // Early exit for perfect match (exact JS logic)
                if similarity >= 0.95 {
                    web_sys::console::log_1(&format!("WASM: Perfect match found at position {}", i).into());
                    break;
                }
            }
        }
    }
    
    web_sys::console::log_1(&format!("WASM: Best match: cleaned_start={}, similarity={:.3}", best_cleaned_start_index, best_similarity).into());
    
    // Only proceed if we have a reasonable similarity (copying JS threshold logic)
    if best_similarity <= 0.0 {
        web_sys::console::log_1(&"WASM: No match found - similarity is 0".into());
        return Vec::new();
    }
    
    // Map cleaned text indices back to word boxes using the exact JS algorithm
    let best_cleaned_end_index = best_cleaned_start_index + window_size;
    
    // The key insight: we need to find which word boxes correspond to the cleaned word indices
    // Since the word boxes are extracted in order, we need to map the cleaned word positions
    // back to the original word box positions
    
    web_sys::console::log_1(&format!("WASM: Mapping cleaned indices [{}, {}) back to word boxes", 
        best_cleaned_start_index, best_cleaned_end_index).into());
    
    // Create a mapping from word box text to cleaned word positions
    let mut word_box_to_cleaned_index = Vec::new();
    let mut cleaned_word_index = 0;
    
    // Debug: show first few word boxes and cleaned words
    web_sys::console::log_1(&format!("WASM: First 10 word boxes: {:?}", 
        word_boxes.iter().take(10).map(|wb| &wb.text).collect::<Vec<_>>()).into());
    web_sys::console::log_1(&format!("WASM: First 10 cleaned words: {:?}", 
        cleaned_words.iter().take(10).collect::<Vec<_>>()).into());
    
    for (box_index, word_box) in word_boxes.iter().enumerate() {
        // Check if this word box text matches the cleaned word at this position
        if cleaned_word_index < cleaned_words.len() {
            let cleaned_word = cleaned_words[cleaned_word_index];
            let box_original_text = word_box.text.trim();
            let box_clean_text = word_box.clean_text.trim();
            
            // Try multiple matching strategies
            let matches = box_original_text.to_lowercase() == cleaned_word.to_lowercase() ||
                         box_clean_text.to_lowercase() == cleaned_word.to_lowercase() ||
                         box_original_text == cleaned_word ||
                         box_clean_text == cleaned_word;
            
            if matches {
                word_box_to_cleaned_index.push((box_index, cleaned_word_index));
                cleaned_word_index += 1;
                
                if box_index < 20 {  // Debug first few matches
                    web_sys::console::log_1(&format!("WASM: Match {}: box[{}]='{}' -> cleaned[{}]='{}'", 
                        word_box_to_cleaned_index.len() - 1, box_index, box_original_text, cleaned_word_index - 1, cleaned_word).into());
                }
            } else if box_index < 20 {  // Debug first few non-matches
                web_sys::console::log_1(&format!("WASM: NO match: box[{}]='{}' (clean='{}') vs cleaned[{}]='{}'", 
                    box_index, box_original_text, box_clean_text, cleaned_word_index, cleaned_word).into());
            }
        }
    }
    
    web_sys::console::log_1(&format!("WASM: Mapped {} word boxes to cleaned positions", word_box_to_cleaned_index.len()).into());
    
    // Find the word boxes that correspond to our match
    let mut result_boxes = Vec::new();
    for (box_index, cleaned_index) in word_box_to_cleaned_index {
        if cleaned_index >= best_cleaned_start_index && cleaned_index < best_cleaned_end_index {
            result_boxes.push(word_boxes[box_index].clone());
        }
    }
    
    web_sys::console::log_1(&format!("WASM: Found {} word boxes for match", result_boxes.len()).into());
    result_boxes
}

/// Exact copy of JS sequenceSimilarity algorithm
fn js_sequence_similarity(seq1: &[&str], seq2: &[&str]) -> f64 {
    let max_length = std::cmp::max(seq1.len(), seq2.len());
    if max_length == 0 {
        return 1.0;
    }
    
    let matches = seq1.iter()
        .zip(seq2.iter())
        .filter(|(a, b)| a == b)
        .count();
    
    matches as f64 / max_length as f64
}

/// Simple string similarity for legacy function
fn calculate_string_similarity(s1: &str, s2: &str) -> f64 {
    let chars1: Vec<char> = s1.chars().collect();
    let chars2: Vec<char> = s2.chars().collect();
    
    let matching = chars1.iter()
        .zip(chars2.iter())
        .filter(|(a, b)| a == b)
        .count();
    
    let max_len = std::cmp::max(chars1.len(), chars2.len());
    if max_len == 0 {
        1.0
    } else {
        matching as f64 / max_len as f64
    }
}

/// Calculate bounding box from a list of word boxes
fn calculate_bounding_box_from_words(word_boxes: &[WordBox]) -> Option<BoundingBox> {
    if word_boxes.is_empty() {
        return None;
    }
    
    // Find the minimum and maximum coordinates
    let min_x = word_boxes.iter().map(|w| w.x1).fold(f64::INFINITY, f64::min);
    let min_y = word_boxes.iter().map(|w| w.y1).fold(f64::INFINITY, f64::min);
    let max_x = word_boxes.iter().map(|w| w.x2).fold(f64::NEG_INFINITY, f64::max);
    let max_y = word_boxes.iter().map(|w| w.y2).fold(f64::NEG_INFINITY, f64::max);
    
    Some(BoundingBox::new(min_x, min_y, max_x, max_y))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_embedded_text() {
        let hocr_sample = r#"
        <p class='ocr_par'>
            <span class='ocr_line' title='bbox 100 200 300 400'>
                <span class='ocrx_word'>Hello</span>
                <span class='ocrx_word'>World</span>
            </span>
        </p>"#;
        
        let result = extract_embedded_text_from_hocr(hocr_sample);
        assert!(result.contains("[[PARAGRAPH]]"));
        assert!(result.contains("[[LINE 100 200 300 400]]"));
        assert!(result.contains("Hello"));
        assert!(result.contains("World"));
    }
}