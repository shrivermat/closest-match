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
                
                // Extract words within this line
                let line_start = line_cap.get(0).unwrap().end();
                let remaining_content = &par_content[line_start..];
                
                if let Some(line_end) = remaining_content.find("</span>") {
                    let line_content = &remaining_content[..line_end];
                    
                    for word_cap in word_regex.captures_iter(line_content) {
                        if let Some(word_text) = word_cap.get(1) {
                            let word = word_text.as_str().trim();
                            if !word.is_empty() {
                                embedded_text.push(word.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    
    embedded_text.join(" ")
}

/// Extract bounding box coordinates for a matched string
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

/// Calculate string similarity (character-based)
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