use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AnnotationStyle {
    pub border_color_r: f64,
    pub border_color_g: f64, 
    pub border_color_b: f64,
    pub fill_color_r: f64,
    pub fill_color_g: f64,
    pub fill_color_b: f64,
    pub opacity: f64,
    pub border_width: f64,
    pub font_size: f64,
    pub font_color_r: f64,
    pub font_color_g: f64,
    pub font_color_b: f64,
}

#[wasm_bindgen]
impl AnnotationStyle {
    #[wasm_bindgen(constructor)]
    pub fn new() -> AnnotationStyle {
        AnnotationStyle::rectangle_style()
    }
    
    #[wasm_bindgen]
    pub fn rectangle_style() -> AnnotationStyle {
        AnnotationStyle {
            border_color_r: 1.0,
            border_color_g: 0.0,
            border_color_b: 0.0,
            fill_color_r: 1.0,
            fill_color_g: 0.0,
            fill_color_b: 0.0,
            opacity: 0.1,
            border_width: 2.0,
            font_size: 10.0,
            font_color_r: 1.0,
            font_color_g: 0.0,
            font_color_b: 0.0,
        }
    }
    
    #[wasm_bindgen]
    pub fn highlight_style() -> AnnotationStyle {
        AnnotationStyle {
            border_color_r: 1.0,
            border_color_g: 1.0,
            border_color_b: 0.0,
            fill_color_r: 1.0,
            fill_color_g: 1.0,
            fill_color_b: 0.0,
            opacity: 0.3,
            border_width: 0.0,
            font_size: 10.0,
            font_color_r: 0.8,
            font_color_g: 0.8,
            font_color_b: 0.0,
        }
    }
    
    #[wasm_bindgen]
    pub fn underline_style() -> AnnotationStyle {
        AnnotationStyle {
            border_color_r: 0.0,
            border_color_g: 0.0,
            border_color_b: 1.0,
            fill_color_r: 0.0,
            fill_color_g: 0.0,
            fill_color_b: 1.0,
            opacity: 1.0,
            border_width: 2.0,
            font_size: 10.0,
            font_color_r: 0.0,
            font_color_g: 0.0,
            font_color_b: 1.0,
        }
    }
    
    #[wasm_bindgen]
    pub fn strikethrough_style() -> AnnotationStyle {
        AnnotationStyle {
            border_color_r: 0.5,
            border_color_g: 0.5,
            border_color_b: 0.5,
            fill_color_r: 0.5,
            fill_color_g: 0.5,
            fill_color_b: 0.5,
            opacity: 1.0,
            border_width: 2.0,
            font_size: 10.0,
            font_color_r: 0.5,
            font_color_g: 0.5,
            font_color_b: 0.5,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CoordinateTransform {
    pub scale_x: f64,
    pub scale_y: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub page_height: f64,
}

#[wasm_bindgen]
impl CoordinateTransform {
    #[wasm_bindgen(constructor)]
    pub fn new(scale_x: f64, scale_y: f64, offset_x: f64, offset_y: f64, page_height: f64) -> CoordinateTransform {
        CoordinateTransform {
            scale_x,
            scale_y,
            offset_x,
            offset_y,
            page_height,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PDFCoordinates {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[wasm_bindgen]
impl PDFCoordinates {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> PDFCoordinates {
        PDFCoordinates { x, y, width, height }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationData {
    pub annotation_type: String,
    pub coordinates: PDFCoordinates,
    pub style: AnnotationStyle,
    pub similarity_score: f64,
    pub matched_text: String,
}

impl AnnotationData {
    pub fn new(
        annotation_type: String,
        coordinates: PDFCoordinates,
        style: AnnotationStyle,
        similarity_score: f64,
        matched_text: String,
    ) -> AnnotationData {
        AnnotationData {
            annotation_type,
            coordinates,
            style,
            similarity_score,
            matched_text,
        }
    }
}

/// Calculate coordinate transformation from hOCR to PDF space
/// This follows the enhanced logic from the TypeScript implementation
#[wasm_bindgen]
pub fn calculate_coordinate_transform(
    pdf_page_width: f64,
    pdf_page_height: f64,
    hocr_page_width: f64,
    hocr_page_height: f64,
) -> CoordinateTransform {
    let scale_x = pdf_page_width / hocr_page_width;
    let scale_y = pdf_page_height / hocr_page_height;
    
    CoordinateTransform::new(scale_x, scale_y, 0.0, 0.0, pdf_page_height)
}

/// Transform hOCR coordinates to PDF coordinates - EXACT JavaScript algorithm port
/// Based on the JavaScript PDFAnnotator.transformCoordinates method
#[wasm_bindgen]
pub fn transform_coordinates(
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    transform: &CoordinateTransform,
) -> PDFCoordinates {
    // Exact port of JavaScript algorithm:
    // const x = hocrBbox.x1 * scaleX;
    // const width = (hocrBbox.x2 - hocrBbox.x1) * scaleX;
    // const y = pdfPageSize.height - (hocrBbox.y2 * scaleY);
    // const height = (hocrBbox.y2 - hocrBbox.y1) * scaleY;
    
    let x = x1 * transform.scale_x;
    let width = (x2 - x1) * transform.scale_x;
    
    // Key difference: JavaScript uses y2 for the flip calculation
    let y = transform.page_height - (y2 * transform.scale_y);
    let height = (y2 - y1) * transform.scale_y;
    
    PDFCoordinates::new(x, y, width, height)
}

/// Parse color string to RGB values (enhanced from TypeScript implementation)
#[wasm_bindgen]
pub fn parse_color(color_string: &str) -> Option<Box<[f64]>> {
    // Handle hex colors (#ff0000, #f00)
    if color_string.starts_with('#') {
        let hex = &color_string[1..];
        let (r, g, b) = if hex.len() == 3 {
            let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
            (r, g, b)
        } else if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            (r, g, b)
        } else {
            return None;
        };
        
        return Some(Box::new([r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0]));
    }
    
    // Handle named colors (basic set)
    let named_colors = match color_string.to_lowercase().as_str() {
        "red" => Some([1.0, 0.0, 0.0]),
        "green" => Some([0.0, 1.0, 0.0]),
        "blue" => Some([0.0, 0.0, 1.0]),
        "yellow" => Some([1.0, 1.0, 0.0]),
        "orange" => Some([1.0, 0.5, 0.0]),
        "purple" => Some([0.5, 0.0, 0.5]),
        "pink" => Some([1.0, 0.75, 0.8]),
        "cyan" => Some([0.0, 1.0, 1.0]),
        "magenta" => Some([1.0, 0.0, 1.0]),
        "black" => Some([0.0, 0.0, 0.0]),
        "white" => Some([1.0, 1.0, 1.0]),
        "gray" | "grey" => Some([0.5, 0.5, 0.5]),
        _ => None,
    };
    
    named_colors.map(|color| {
        let boxed: Box<[f64]> = Box::new(color);
        boxed
    })
}

/// Create annotation style with custom colors
#[wasm_bindgen]
pub fn create_custom_annotation_style(
    border_color: &str,
    fill_color: Option<String>,
    opacity: f64,
    border_width: f64,
    font_size: f64,
) -> Option<AnnotationStyle> {
    let border_rgb = parse_color(border_color)?;
    
    let mut style = AnnotationStyle {
        border_color_r: border_rgb[0],
        border_color_g: border_rgb[1],
        border_color_b: border_rgb[2],
        fill_color_r: border_rgb[0],
        fill_color_g: border_rgb[1],
        fill_color_b: border_rgb[2],
        opacity,
        border_width,
        font_size,
        font_color_r: border_rgb[0] * 0.8,
        font_color_g: border_rgb[1] * 0.8,
        font_color_b: border_rgb[2] * 0.8,
    };
    
    if let Some(fill_color_str) = fill_color {
        if let Some(fill_rgb) = parse_color(&fill_color_str) {
            style.fill_color_r = fill_rgb[0];
            style.fill_color_g = fill_rgb[1];
            style.fill_color_b = fill_rgb[2];
        }
    }
    
    Some(style)
}

/// Generate annotation data for a given bounding box and match information
/// This is the main function that JavaScript/TypeScript can call to get annotation data
pub fn create_annotation_data(
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    transform: &CoordinateTransform,
    annotation_type: &str,
    similarity_score: f64,
    matched_text: &str,
    custom_style: Option<AnnotationStyle>,
) -> AnnotationData {
    // Transform coordinates
    let coordinates = transform_coordinates(x1, y1, x2, y2, transform);
    
    // Get or create style
    let style = custom_style.unwrap_or_else(|| {
        match annotation_type {
            "highlight" => AnnotationStyle::highlight_style(),
            "underline" => AnnotationStyle::underline_style(),
            "strikethrough" => AnnotationStyle::strikethrough_style(),
            _ => AnnotationStyle::rectangle_style(),
        }
    });
    
    AnnotationData::new(
        annotation_type.to_string(),
        coordinates,
        style,
        similarity_score,
        matched_text.to_string(),
    )
}

/// Batch process multiple annotations
#[wasm_bindgen]
pub fn create_multiple_annotations(
    bounding_boxes: &js_sys::Array,
    transform: &CoordinateTransform,
    annotation_type: &str,
    custom_style: Option<AnnotationStyle>,
) -> js_sys::Array {
    let results = js_sys::Array::new();
    
    for i in 0..bounding_boxes.length() {
        if let Some(bbox_obj) = bounding_boxes.get(i).dyn_into::<js_sys::Object>().ok() {
            // Extract bounding box values
            let x1 = js_sys::Reflect::get(&bbox_obj, &"x1".into())
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let y1 = js_sys::Reflect::get(&bbox_obj, &"y1".into())
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let x2 = js_sys::Reflect::get(&bbox_obj, &"x2".into())
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let y2 = js_sys::Reflect::get(&bbox_obj, &"y2".into())
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let similarity = js_sys::Reflect::get(&bbox_obj, &"similarity".into())
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(1.0);
            let text = js_sys::Reflect::get(&bbox_obj, &"text".into())
                .ok()
                .and_then(|v| v.as_string())
                .unwrap_or_else(|| "".to_string());
            
            let annotation = create_annotation_data(
                x1, y1, x2, y2,
                transform,
                annotation_type,
                similarity,
                &text,
                custom_style.clone(),
            );
            
            // Convert to JavaScript object
            let js_annotation = js_sys::Object::new();
            js_sys::Reflect::set(&js_annotation, &"annotationType".into(), &annotation.annotation_type.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"x".into(), &annotation.coordinates.x.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"y".into(), &annotation.coordinates.y.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"width".into(), &annotation.coordinates.width.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"height".into(), &annotation.coordinates.height.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"similarityScore".into(), &annotation.similarity_score.into()).unwrap();
            js_sys::Reflect::set(&js_annotation, &"matchedText".into(), &annotation.matched_text.into()).unwrap();
            
            // Add style information
            let style_obj = js_sys::Object::new();
            js_sys::Reflect::set(&style_obj, &"borderColorR".into(), &annotation.style.border_color_r.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"borderColorG".into(), &annotation.style.border_color_g.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"borderColorB".into(), &annotation.style.border_color_b.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"fillColorR".into(), &annotation.style.fill_color_r.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"fillColorG".into(), &annotation.style.fill_color_g.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"fillColorB".into(), &annotation.style.fill_color_b.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"opacity".into(), &annotation.style.opacity.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"borderWidth".into(), &annotation.style.border_width.into()).unwrap();
            js_sys::Reflect::set(&style_obj, &"fontSize".into(), &annotation.style.font_size.into()).unwrap();
            
            js_sys::Reflect::set(&js_annotation, &"style".into(), &style_obj).unwrap();
            
            results.push(&js_annotation);
        }
    }
    
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coordinate_transform() {
        let transform = calculate_coordinate_transform(595.0, 842.0, 2560.0, 3300.0);
        assert!((transform.scale_x - 0.2324).abs() < 0.001);
        assert!((transform.scale_y - 0.2552).abs() < 0.001);
    }

    #[test]
    fn test_transform_coordinates() {
        let transform = CoordinateTransform::new(0.5, 0.5, 0.0, 0.0, 800.0);
        let coords = transform_coordinates(100.0, 200.0, 300.0, 400.0, &transform);
        
        assert_eq!(coords.x, 50.0); // 100 * 0.5
        assert_eq!(coords.width, 100.0); // (300 - 100) * 0.5
        assert_eq!(coords.y, 600.0); // 800 - (400 * 0.5)
        assert_eq!(coords.height, 100.0); // (400 - 200) * 0.5
    }

    #[test]
    fn test_parse_color() {
        // Test hex colors
        let red_hex = parse_color("#ff0000").unwrap();
        assert_eq!(*red_hex, [1.0, 0.0, 0.0]);
        
        let short_red = parse_color("#f00").unwrap();
        assert_eq!(*short_red, [1.0, 0.0, 0.0]);
        
        // Test named colors
        let blue_named = parse_color("blue").unwrap();
        assert_eq!(*blue_named, [0.0, 0.0, 1.0]);
        
        // Test invalid color
        assert!(parse_color("invalid").is_none());
    }

    #[test]
    fn test_annotation_styles() {
        let rect_style = AnnotationStyle::rectangle_style();
        assert_eq!(rect_style.border_color_r, 1.0);
        assert_eq!(rect_style.opacity, 0.1);
        
        let highlight_style = AnnotationStyle::highlight_style();
        assert_eq!(highlight_style.border_color_g, 1.0);
        assert_eq!(highlight_style.opacity, 0.3);
    }
}