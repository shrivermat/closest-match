# WASM Deployment Architecture Guide

## Overview
This document explains how WebAssembly (WASM) is built, deployed, and served in this document annotation project.

## Directory Structure

```
closest-match/
├── src/                     # Rust source code
│   ├── lib.rs              # Rust library entry point
│   ├── hocr_parser.rs      # hOCR parsing logic
│   ├── string_matching.rs  # Text matching algorithms
│   └── document-annotator.ts # TypeScript WASM consumer
├── pkg/                     # wasm-pack output (generated)
│   ├── document_annotator.js         # JS bindings (generated)
│   ├── document_annotator_bg.wasm    # Optimized WASM binary
│   └── document_annotator.d.ts       # TypeScript definitions
├── dist/                    # Webpack output & dev server root
│   ├── index.js            # Compiled TypeScript bundle
│   ├── document_annotator_bg.wasm    # WASM file for serving
│   ├── *.wasm              # Hashed WASM files from webpack
│   └── index.html          # Demo page
└── target/                  # Rust compilation output
    └── wasm32-unknown-unknown/release/document_annotator.wasm # Raw WASM
```

## Build Process Flow

### 1. WASM Build (`npm run build:wasm`)
```bash
wasm-pack build --target web --out-dir pkg
```

**What happens:**
1. Compiles Rust code to raw WASM (`target/wasm32-unknown-unknown/release/document_annotator.wasm`)
2. Runs `wasm-opt` to optimize the WASM binary
3. Generates JavaScript bindings (`pkg/document_annotator.js`)
4. Creates optimized WASM file (`pkg/document_annotator_bg.wasm`)
5. Generates TypeScript definitions (`pkg/document_annotator.d.ts`)

**Output files in `pkg/`:**
- `document_annotator.js` - Contains WASM loading and binding code
- `document_annotator_bg.wasm` - Optimized WASM binary (~1MB)
- `document_annotator.d.ts` - TypeScript type definitions

### 2. JavaScript Build (`npm run build:js`)
```bash
webpack --mode production
```

**What happens:**
1. Compiles TypeScript source (`src/index.ts` + dependencies)
2. Bundles with dependencies into `dist/index.js`
3. Copies WASM files to `dist/` with content hashes
4. Generates source maps and type definitions

**File naming issue:** Webpack creates hashed WASM files (e.g., `916dc0c208e3d4de03c8.wasm`) but the JavaScript bindings look for `document_annotator_bg.wasm`.

### 3. Development Server (`npm run dev`)
```bash
webpack serve --mode development
```

**What happens:**
1. Starts webpack dev server on port 9000
2. Serves files from `dist/` directory (configured in `webpack.config.js`)
3. Enables hot module replacement
4. Watches for file changes and rebuilds

## WASM Loading Mechanism

### Import Chain
```typescript
// src/document-annotator.ts
const wasmModuleImport = await import('../pkg/document_annotator');
await wasmModuleImport.default(); // Initialize WASM
```

### Generated JavaScript (pkg/document_annotator.js)
```javascript
// Default WASM loading logic
if (typeof module_or_path === 'undefined') {
    module_or_path = new URL('document_annotator_bg.wasm', import.meta.url);
}
```

**Key insight:** The WASM is loaded relative to where the JavaScript bundle is served from. Since the bundle is at `http://localhost:9000/index.js`, it looks for WASM at `http://localhost:9000/document_annotator_bg.wasm`.

## Current Deployment Issues

### Problem 1: File Naming Mismatch
- **Webpack** creates hashed WASM files: `916dc0c208e3d4de03c8.wasm`
- **JavaScript bindings** look for: `document_annotator_bg.wasm`
- **Solution:** Copy `pkg/document_annotator_bg.wasm` to `dist/document_annotator_bg.wasm`

### Problem 2: Multiple WASM Versions
Current `dist/` directory contains:
```bash
-rwxrwxrwx 1059316 bytes  66d4ada2265cd7d03f46.wasm     # Old version
-rwxrwxrwx 1059302 bytes  916dc0c208e3d4de03c8.wasm     # Newer version
-rwxrwxrwx 1059302 bytes  document_annotator_bg.wasm    # Expected name
```

### Problem 3: Dev Server Caching
- Webpack dev server may cache old WASM files
- Browser may cache WASM binaries
- Hot module replacement doesn't always refresh WASM

## Verification Steps

### 1. Check WASM File Exists
```bash
ls -la /mnt/c/Repos/closest-match/dist/document_annotator_bg.wasm
```

### 2. Verify File Size/Date
```bash
ls -la /mnt/c/Repos/closest-match/pkg/document_annotator_bg.wasm
ls -la /mnt/c/Repos/closest-match/dist/document_annotator_bg.wasm
```
Files should have same size and `dist/` version should be newer.

### 3. Check Network Tab
- Look for request to `document_annotator_bg.wasm`
- Verify it returns 200 OK, not 404
- Check file size matches expected (~1MB)

### 4. Test WASM Functions
```javascript
// Should work if WASM loaded correctly
const wasmModuleImport = await import('./pkg/document_annotator');
await wasmModuleImport.default();
console.log('Available functions:', Object.keys(wasmModuleImport));
```

## Deployment Workflow

### For Development Changes:
1. **Modify Rust code** in `src/`
2. **Build WASM:** `npm run build:wasm`
3. **Copy to dist:** `cp pkg/document_annotator_bg.wasm dist/`
4. **Hard refresh browser** (Ctrl+Shift+R)
5. **Verify in Network tab** that new WASM loads

### For Production Build:
1. **Build WASM:** `npm run build:wasm`
2. **Build JS:** `npm run build:js`
3. **Copy WASM:** `cp pkg/document_annotator_bg.wasm dist/`
4. **Deploy `dist/` directory**

## Debugging Tips

### Check WASM Loading
```javascript
// Add to browser console
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('.wasm'))
  .forEach(r => console.log(r.name, r.responseEnd - r.fetchStart + 'ms'));
```

### Verify WASM Functions
```javascript
// Test direct WASM import
import('./pkg/document_annotator').then(async (wasm) => {
  await wasm.default();
  console.log('WASM functions:', Object.keys(wasm));
});
```

### Force Clear Caches
1. **Dev server restart:** Kill webpack process and restart
2. **Browser cache:** Hard refresh (Ctrl+Shift+R)  
3. **Incognito mode:** Use fresh browser context
4. **Clear webpack cache:** Delete `node_modules/.cache/`

## File Size Reference
- **Raw Rust WASM:** ~1.6MB (`target/` directory)
- **Optimized WASM:** ~1MB (`pkg/` and `dist/` directories)
- **Size differences:** Indicate different versions/optimizations

## Next Steps
1. ✅ Verify correct WASM file in `dist/document_annotator_bg.wasm`
2. ✅ Check Network tab shows successful WASM load
3. ✅ Test debug functions are available
4. ✅ Verify coordinate fixes are working
5. ✅ Document any WSL/Windows-specific file sync issues