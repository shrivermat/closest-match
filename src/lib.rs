mod utils;
mod string_matching;
mod hocr_parser;
mod pdf_annotator;

use wasm_bindgen::prelude::*;
use web_sys::console;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// Version and build information
const VERSION: &str = env!("CARGO_PKG_VERSION");
const PACKAGE_NAME: &str = env!("CARGO_PKG_NAME");

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, document-annotator!");
}

/// Get the current WASM module version
#[wasm_bindgen]
pub fn get_version() -> String {
    VERSION.to_string()
}

/// Get the package name
#[wasm_bindgen]
pub fn get_package_name() -> String {
    PACKAGE_NAME.to_string()
}

/// Log version information to browser console with timestamp
#[wasm_bindgen]
pub fn log_version_info() {
    let now = js_sys::Date::new_0();
    let timestamp = now.to_iso_string().as_string().unwrap_or_else(|| "unknown".to_string());
    
    console::log_4(
        &"[WASM Module Loaded]".into(),
        &format!("Package: {}", PACKAGE_NAME).into(),
        &format!("Version: {}", VERSION).into(),
        &format!("Loaded at: {}", timestamp).into(),
    );
    
    // Also log the key features available
    console::log_2(
        &"[WASM Features]".into(),
        &"✅ Word-level coordinate extraction, ✅ Fuzzy matching, ✅ Multiple annotation types".into(),
    );
}

/// Get detailed version information as a JavaScript object
#[wasm_bindgen]
pub fn get_version_info() -> js_sys::Object {
    let info = js_sys::Object::new();
    let now = js_sys::Date::new_0();
    let timestamp = now.to_iso_string().as_string().unwrap_or_else(|| "unknown".to_string());
    
    js_sys::Reflect::set(&info, &"packageName".into(), &PACKAGE_NAME.into()).unwrap();
    js_sys::Reflect::set(&info, &"version".into(), &VERSION.into()).unwrap();
    js_sys::Reflect::set(&info, &"loadedAt".into(), &timestamp.into()).unwrap();
    js_sys::Reflect::set(&info, &"features".into(), &js_sys::Array::of4(
        &"word-level-extraction".into(),
        &"fuzzy-matching".into(), 
        &"multiple-annotation-types".into(),
        &"enhanced-coordinate-transformation".into()
    )).unwrap();
    
    info
}

// Export the main string matching functionality
pub use string_matching::*;
pub use hocr_parser::*;
pub use pdf_annotator::*;