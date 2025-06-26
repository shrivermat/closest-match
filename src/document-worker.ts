/**
 * Document Processing Web Worker
 * Handles text matching and hOCR processing in a separate thread
 */

// Import types for worker context
declare const self: Worker;

// Worker will receive the WASM module through initialization
let wasmModule: any = null;
let isInitialized = false;

interface WorkerMessage {
  type: 'ping' | 'init_wasm' | 'execute_task';
  taskId?: string;
  taskType?: string;
  data?: any;
  wasmModule?: any;
}

interface TaskData {
  embeddedText?: string;
  searchQueries?: any[];
  hocrContent?: string;
  searchString?: string;
  tolerance?: number;
  pageObj?: any;
}

// Initialize worker
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, taskId, taskType, data, wasmModule: wasmModuleData } = event.data;

  try {
    switch (type) {
      case 'ping':
        self.postMessage({ type: 'ping_response' });
        break;

      case 'init_wasm':
        await initializeWasm(wasmModuleData);
        self.postMessage({ type: 'init_complete', success: isInitialized });
        break;

      case 'execute_task':
        if (!isInitialized) {
          throw new Error('WASM module not initialized');
        }
        
        const result = await executeTask(taskType!, data);
        self.postMessage({
          type: 'task_complete',
          taskId,
          success: true,
          data: result
        });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      type: 'task_complete',
      taskId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

async function initializeWasm(wasmModuleData: any): Promise<void> {
  try {
    // In a real implementation, we would import the WASM module here
    // For now, we'll simulate the initialization
    wasmModule = wasmModuleData || {
      find_closest_match: mockFindClosestMatch,
      extract_bounding_box: mockExtractBoundingBox,
      extract_embedded_text_from_hocr: mockExtractEmbeddedText
    };
    
    isInitialized = true;
    console.log('Worker WASM module initialized');
  } catch (error) {
    console.error('Failed to initialize WASM in worker:', error);
    isInitialized = false;
    throw error;
  }
}

async function executeTask(taskType: string, data: TaskData): Promise<any> {
  const startTime = performance.now();

  switch (taskType) {
    case 'find_matches':
      return await findMatches(data);
    
    case 'extract_hocr':
      return await extractHocr(data);
    
    case 'process_page':
      return await processPage(data);
    
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
}

async function findMatches(data: TaskData): Promise<any[]> {
  const { embeddedText, searchQueries, tolerance = 0.8, pageObj } = data;
  
  if (!embeddedText || !searchQueries) {
    throw new Error('Missing required data for find_matches task');
  }

  const matches: any[] = [];

  for (const query of searchQueries) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 10));

    const wasmResult = wasmModule.find_closest_match(embeddedText, query.text);

    if (wasmResult && wasmResult.similarity >= tolerance) {
      const boundingBox = wasmModule.extract_bounding_box(embeddedText, wasmResult.text);

      if (boundingBox) {
        matches.push({
          text: wasmResult.text,
          similarity: wasmResult.similarity,
          boundingBox: [boundingBox.x1, boundingBox.y1, boundingBox.x2, boundingBox.y2],
          pageNumber: pageObj?.pageNumber || 1,
          docUID: pageObj?.docUID || 'unknown',
          searchQuery: query.text,
          startIndex: wasmResult.start_index,
          endIndex: wasmResult.end_index,
          annotationType: query.annotationType,
          formatting: query.formatting
        });
      }
    }
  }

  return matches;
}

async function extractHocr(data: TaskData): Promise<string> {
  const { hocrContent } = data;
  
  if (!hocrContent) {
    throw new Error('Missing hOCR content for extract_hocr task');
  }

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 50));

  return wasmModule.extract_embedded_text_from_hocr(hocrContent);
}

async function processPage(data: TaskData): Promise<any> {
  const { hocrContent, searchQueries, tolerance, pageObj } = data;
  
  if (!hocrContent || !searchQueries) {
    throw new Error('Missing required data for process_page task');
  }

  // Extract embedded text
  const embeddedText = await extractHocr({ hocrContent });
  
  // Find matches
  const matches = await findMatches({
    embeddedText,
    searchQueries,
    tolerance,
    pageObj
  });

  return {
    embeddedText,
    matches,
    pageNumber: pageObj?.pageNumber || 1,
    docUID: pageObj?.docUID || 'unknown'
  };
}

// Mock WASM functions for testing (these would be replaced by actual WASM imports)
function mockFindClosestMatch(embeddedText: string, searchString: string): any {
  // Simple mock implementation
  const words = embeddedText.toLowerCase().split(/\s+/);
  const searchWords = searchString.toLowerCase().split(/\s+/);
  
  let bestSimilarity = 0;
  let bestMatch = '';
  let bestStartIndex = 0;
  let bestEndIndex = 0;

  for (let i = 0; i <= words.length - searchWords.length; i++) {
    const window = words.slice(i, i + searchWords.length);
    const windowText = window.join(' ');
    
    // Simple similarity calculation
    const similarity = calculateSimilarity(windowText, searchString.toLowerCase());
    
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = window.join(' ');
      bestStartIndex = i;
      bestEndIndex = i + searchWords.length;
    }
  }

  if (bestSimilarity > 0.5) {
    return {
      text: bestMatch,
      similarity: bestSimilarity,
      start_index: bestStartIndex,
      end_index: bestEndIndex
    };
  }

  return null;
}

function mockExtractBoundingBox(embeddedText: string, matchText: string): any {
  // Mock bounding box extraction
  return {
    x1: Math.random() * 500 + 100,
    y1: Math.random() * 300 + 100,
    x2: Math.random() * 200 + 300,
    y2: Math.random() * 50 + 200
  };
}

function mockExtractEmbeddedText(hocrContent: string): string {
  // Mock hOCR extraction
  const textMatch = hocrContent.match(/>([^<]+)</g);
  if (textMatch) {
    return textMatch.map(match => match.slice(1, -1)).join(' ');
  }
  return 'Mock embedded text from hOCR';
}

function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 1;
  
  let matches = 0;
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      matches++;
    }
  }
  
  return matches / maxLen;
}

// Export for TypeScript compilation
export {};