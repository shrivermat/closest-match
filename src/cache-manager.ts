/**
 * Cache Manager for Document Annotator
 * Provides persistent caching using IndexedDB for:
 * - Processed hOCR data
 * - String matching results
 * - PDF metadata
 * - Processing statistics
 */

export interface CacheEntry<T = any> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt?: number;
  version: string;
  size?: number;
}

export interface CacheConfig {
  dbName: string;
  version: number;
  maxAge: number; // milliseconds
  maxSize: number; // bytes
  enableCompression: boolean;
}

export interface ProcessingStats {
  totalProcessed: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  lastUpdated: number;
}

export class CacheManager {
  private db: IDBDatabase | null = null;
  private config: CacheConfig;
  private stats: ProcessingStats = {
    totalProcessed: 0,
    averageProcessingTime: 0,
    cacheHitRate: 0,
    lastUpdated: Date.now()
  };

  private static readonly DEFAULT_CONFIG: CacheConfig = {
    dbName: 'DocumentAnnotatorCache',
    version: 1,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 100 * 1024 * 1024, // 100MB
    enableCompression: true
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...CacheManager.DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the cache database
   */
  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = () => reject(new Error(`Failed to open cache database: ${request.error}`));
      
      request.onsuccess = () => {
        this.db = request.result;
        this.loadStats();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('hocr_data')) {
          db.createObjectStore('hocr_data', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('match_results')) {
          db.createObjectStore('match_results', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('pdf_metadata')) {
          db.createObjectStore('pdf_metadata', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('processing_stats')) {
          db.createObjectStore('processing_stats', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store data in cache
   */
  async set<T>(
    store: 'hocr_data' | 'match_results' | 'pdf_metadata' | 'processing_stats',
    key: string,
    data: T,
    expiresIn?: number
  ): Promise<void> {
    await this.initialize();
    
    if (!this.db) {
      throw new Error('Cache database not initialized');
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      data: this.config.enableCompression ? this.compress(data) as T : data,
      timestamp: now,
      expiresAt: expiresIn ? now + expiresIn : now + this.config.maxAge,
      version: '1.0',
      size: this.estimateSize(data)
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.put(entry);

      request.onerror = () => reject(new Error(`Failed to cache data: ${request.error}`));
      request.onsuccess = () => {
        this.updateStats('set');
        resolve();
      };
    });
  }

  /**
   * Retrieve data from cache
   */
  async get<T>(
    store: 'hocr_data' | 'match_results' | 'pdf_metadata' | 'processing_stats',
    key: string
  ): Promise<T | null> {
    await this.initialize();
    
    if (!this.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(key);

      request.onerror = () => reject(new Error(`Failed to retrieve cached data: ${request.error}`));
      
      request.onsuccess = () => {
        const entry: CacheEntry<T> | undefined = request.result;
        
        if (!entry) {
          this.updateStats('miss');
          resolve(null);
          return;
        }

        // Check if expired
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          this.delete(store, key); // Clean up expired entry
          this.updateStats('miss');
          resolve(null);
          return;
        }

        this.updateStats('hit');
        const data = this.config.enableCompression ? this.decompress(entry.data) : entry.data;
        resolve(data as T);
      };
    });
  }

  /**
   * Check if key exists in cache and is not expired
   */
  async has(
    store: 'hocr_data' | 'match_results' | 'pdf_metadata' | 'processing_stats',
    key: string
  ): Promise<boolean> {
    const data = await this.get(store, key);
    return data !== null;
  }

  /**
   * Delete specific entry from cache
   */
  async delete(
    store: 'hocr_data' | 'match_results' | 'pdf_metadata' | 'processing_stats',
    key: string
  ): Promise<void> {
    await this.initialize();
    
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.delete(key);

      request.onerror = () => reject(new Error(`Failed to delete cached data: ${request.error}`));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<void> {
    await this.initialize();
    
    if (!this.db) {
      return;
    }

    const stores = ['hocr_data', 'match_results', 'pdf_metadata', 'processing_stats'];
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(stores, 'readwrite');
      
      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === stores.length) {
          this.resetStats();
          resolve();
        }
      };

      stores.forEach(storeName => {
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.clear();
        request.onerror = () => reject(new Error(`Failed to clear ${storeName}: ${request.error}`));
        request.onsuccess = () => checkComplete();
      });
    });
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<{ removed: number; freedBytes: number }> {
    await this.initialize();
    
    if (!this.db) {
      return { removed: 0, freedBytes: 0 };
    }

    const stores = ['hocr_data', 'match_results', 'pdf_metadata'];
    let totalRemoved = 0;
    let totalFreed = 0;
    const now = Date.now();

    for (const storeName of stores) {
      const entries = await this.getAllEntries(storeName);
      
      for (const entry of entries) {
        if (entry.expiresAt && now > entry.expiresAt) {
          await this.delete(storeName as any, entry.key);
          totalRemoved++;
          totalFreed += entry.size || 0;
        }
      }
    }

    return { removed: totalRemoved, freedBytes: totalFreed };
  }

  /**
   * Get cache statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Get cache size information
   */
  async getCacheInfo(): Promise<{
    totalEntries: number;
    totalSize: number;
    storeInfo: Record<string, { entries: number; size: number }>;
  }> {
    await this.initialize();
    
    const stores = ['hocr_data', 'match_results', 'pdf_metadata'];
    const storeInfo: Record<string, { entries: number; size: number }> = {};
    let totalEntries = 0;
    let totalSize = 0;

    for (const storeName of stores) {
      const entries = await this.getAllEntries(storeName);
      const storeSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
      
      storeInfo[storeName] = {
        entries: entries.length,
        size: storeSize
      };
      
      totalEntries += entries.length;
      totalSize += storeSize;
    }

    return { totalEntries, totalSize, storeInfo };
  }

  /**
   * Generate cache key for hOCR data
   */
  static generateHocrKey(url: string, docUID: string, pageNumber: number): string {
    return `hocr:${docUID}:${pageNumber}:${this.hashString(url)}`;
  }

  /**
   * Generate cache key for match results
   */
  static generateMatchKey(
    searchQuery: string,
    docUID: string,
    pageNumber: number,
    tolerance: number
  ): string {
    const queryHash = this.hashString(searchQuery);
    return `match:${docUID}:${pageNumber}:${queryHash}:${tolerance}`;
  }

  /**
   * Generate cache key for PDF metadata
   */
  static generatePdfKey(url: string, docUID: string): string {
    return `pdf:${docUID}:${this.hashString(url)}`;
  }

  // Private helper methods

  private async getAllEntries(storeName: string): Promise<CacheEntry[]> {
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const objectStore = transaction.objectStore(storeName);
      const request = objectStore.getAll();

      request.onerror = () => reject(new Error(`Failed to get all entries: ${request.error}`));
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  private compress<T>(data: T): string {
    if (!this.config.enableCompression) {
      return data as any;
    }
    
    try {
      return JSON.stringify(data);
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error);
      return data as any;
    }
  }

  private decompress<T>(data: any): T {
    if (!this.config.enableCompression || typeof data !== 'string') {
      return data;
    }
    
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      console.warn('Decompression failed, returning raw data:', error);
      return data as T;
    }
  }

  private estimateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch (error) {
      return 0;
    }
  }

  private updateStats(operation: 'hit' | 'miss' | 'set'): void {
    const now = Date.now();
    
    if (operation === 'set') {
      this.stats.totalProcessed++;
    } else {
      // Update hit rate
      const isHit = operation === 'hit';
      const currentHits = this.stats.cacheHitRate * this.stats.totalProcessed;
      const newHits = isHit ? currentHits + 1 : currentHits;
      this.stats.cacheHitRate = newHits / (this.stats.totalProcessed + 1);
    }
    
    this.stats.lastUpdated = now;
    this.saveStats();
  }

  private resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      averageProcessingTime: 0,
      cacheHitRate: 0,
      lastUpdated: Date.now()
    };
    this.saveStats();
  }

  private async loadStats(): Promise<void> {
    try {
      const savedStats = await this.get<ProcessingStats>('processing_stats', 'global');
      if (savedStats) {
        this.stats = savedStats;
      }
    } catch (error) {
      console.warn('Failed to load cache stats:', error);
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await this.set('processing_stats', 'global', this.stats);
    } catch (error) {
      console.warn('Failed to save cache stats:', error);
    }
  }

  private static hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }
}