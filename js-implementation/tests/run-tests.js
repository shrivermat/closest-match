/**
 * Simple test runner for the JavaScript implementation
 * No external test framework needed - just Node.js
 */

import { TextMatcher } from '../src/text-matcher.js';
import { HOCRParser } from '../src/hocr-parser.js';
import { BoundingBoxExtractor } from '../src/bbox-extractor.js';
import { DocumentProcessor } from '../src/document-processor.js';

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }
    
    test(name, testFn) {
        this.tests.push({ name, testFn });
    }
    
    async run() {
        console.log('🧪 Running JavaScript Implementation Tests\n');
        
        for (const test of this.tests) {
            try {
                await test.testFn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.name}`);
                console.log(`   Error: ${error.message}\n`);
                this.failed++;
            }
        }
        
        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        
        if (this.failed > 0) {
            process.exit(1);
        }
    }
    
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }
    
    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }
    
    assertGreaterThan(actual, expected, message) {
        if (actual <= expected) {
            throw new Error(message || `Expected ${actual} > ${expected}`);
        }
    }
}

const runner = new TestRunner();

// Text Matcher Tests
runner.test('TextMatcher - Perfect sequence similarity', () => {
    const matcher = new TextMatcher();
    const similarity = matcher.sequenceSimilarity(['hello', 'world'], ['hello', 'world']);
    runner.assertEqual(similarity, 1.0, 'Perfect match should return 1.0');
});

runner.test('TextMatcher - Partial sequence similarity', () => {
    const matcher = new TextMatcher();
    const similarity = matcher.sequenceSimilarity(['hello', 'world'], ['hello', 'test']);
    runner.assertEqual(similarity, 0.5, 'Half match should return 0.5');
});

runner.test('TextMatcher - Find closest match', () => {
    const matcher = new TextMatcher();
    const embeddedText = '[[PARAGRAPH]] [[LINE 100 200 300 400]] Hello world this is test text';
    const searchText = 'this is test';
    
    const result = matcher.findClosestMatch(embeddedText, searchText);
    
    runner.assertGreaterThan(result.similarity, 0.8, 'Should find high similarity match');
    runner.assert(result.text.includes('this'), 'Should contain search words');
});

// hOCR Parser Tests
runner.test('HOCRParser - Parse sample hOCR', async () => {
    const parser = new HOCRParser();
    const sampleHOCR = `
        <div class='ocr_page'>
            <p class='ocr_par'>
                <span class='ocr_line' title='bbox 100 200 500 250'>
                    <span class='ocrx_word'>Hello</span>
                    <span class='ocrx_word'>World</span>
                </span>
            </p>
        </div>
    `;
    
    const result = await parser.parseHOCR(sampleHOCR);
    
    runner.assert(result.includes('[[PARAGRAPH]]'), 'Should contain paragraph marker');
    runner.assert(result.includes('[[LINE 100 200 500 250]]'), 'Should contain line marker');
    runner.assert(result.includes('Hello'), 'Should contain words');
    runner.assert(result.includes('World'), 'Should contain words');
});

runner.test('HOCRParser - Extract bounding box', () => {
    const parser = new HOCRParser();
    
    // Create a mock element
    const mockElement = {
        getAttribute: (attr) => {
            if (attr === 'title') return 'bbox 100 200 300 400';
            return null;
        }
    };
    
    const bbox = parser.extractBoundingBox(mockElement);
    
    runner.assertEqual(bbox.x1, 100, 'x1 should be 100');
    runner.assertEqual(bbox.y1, 200, 'y1 should be 200');
    runner.assertEqual(bbox.x2, 300, 'x2 should be 300');
    runner.assertEqual(bbox.y2, 400, 'y2 should be 400');
});

// Bounding Box Extractor Tests
runner.test('BoundingBoxExtractor - Extract coordinates', () => {
    const extractor = new BoundingBoxExtractor();
    const embeddedText = '[[PARAGRAPH]] [[LINE 100 200 300 250]] Hello world [[LINE 100 260 400 310]] this is test';
    const matchText = 'this is test';
    
    const bbox = extractor.extractBoundingBox(embeddedText, matchText);
    
    runner.assert(bbox !== null, 'Should extract bounding box');
    runner.assertGreaterThan(bbox.x1, 0, 'x1 should be positive');
    runner.assertGreaterThan(bbox.y1, 0, 'y1 should be positive');
});

// Document Processor Tests
runner.test('DocumentProcessor - Text matching test', async () => {
    const processor = new DocumentProcessor({ debugMode: false });
    const sampleHOCR = `
        <div class='ocr_page'>
            <p class='ocr_par'>
                <span class='ocr_line' title='bbox 100 200 500 250'>
                    <span class='ocrx_word'>Hello</span>
                    <span class='ocrx_word'>world</span>
                    <span class='ocrx_word'>this</span>
                    <span class='ocrx_word'>is</span>
                    <span class='ocrx_word'>test</span>
                </span>
            </p>
        </div>
    `;
    
    const result = await processor.testTextMatching(sampleHOCR, 'this is test');
    
    runner.assert(result.valid, 'Should find valid match');
    runner.assertGreaterThan(result.matchResult.similarity, 0.7, 'Should have high similarity');
    runner.assert(result.boundingBox !== null, 'Should extract bounding box');
});

// Integration Tests
runner.test('Integration - Complete pipeline without PDF', async () => {
    const processor = new DocumentProcessor({ 
        debugMode: false,
        minSimilarity: 0.7 
    });
    
    const sampleHOCR = `
        <div class='ocr_page' title='bbox 0 0 2560 3300'>
            <p class='ocr_par'>
                <span class='ocr_line' title='bbox 100 200 600 250'>
                    <span class='ocrx_word'>Circuit</span>
                    <span class='ocrx_word'>and</span>
                    <span class='ocrx_word'>method</span>
                    <span class='ocrx_word'>for</span>
                    <span class='ocrx_word'>operating</span>
                </span>
            </p>
        </div>
    `;
    
    // Test without PDF (will fail at PDF annotation step, but should process text successfully)
    try {
        const embeddedText = await processor.hocrParser.parseHOCR(sampleHOCR);
        const match = processor.textMatcher.findClosestMatch(embeddedText, 'method for operating');
        const bbox = processor.bboxExtractor.extractBoundingBox(embeddedText, match.text);
        
        runner.assertGreaterThan(match.similarity, 0.5, 'Should find reasonable match');
        runner.assert(bbox !== null, 'Should extract bounding box');
        
    } catch (error) {
        throw new Error(`Pipeline failed: ${error.message}`);
    }
});

// Run all tests
runner.run().catch(console.error);