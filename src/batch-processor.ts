/**
 * Advanced Batch Processor for Document Annotator
 * Provides intelligent batching, load balancing, and optimization strategies
 */

import type { SearchQuery, PageObject, ProcessingOptions, AnnotatedPage } from './types';

export interface BatchJob {
  id: string;
  searchQueries: SearchQuery[];
  pageObjects: PageObject[];
  options: ProcessingOptions;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: number;
  estimatedTime?: number;
}

export interface BatchResult {
  jobId: string;
  results: AnnotatedPage[];
  stats: BatchProcessingStats;
  success: boolean;
  error?: string;
}

export interface BatchProcessingStats {
  totalPages: number;
  processedPages: number;
  failedPages: number;
  totalTime: number;
  averageTimePerPage: number;
  parallelEfficiency: number;
  cacheHitRate: number;
  memoryUsage: number;
  throughput: number; // pages per second
}

export interface OptimizationStrategy {
  batchSize: number;
  workerCount: number;
  cacheStrategy: 'aggressive' | 'conservative' | 'minimal';
  priorityQueue: boolean;
  loadBalancing: 'round_robin' | 'least_busy' | 'fastest' | 'adaptive';
  memoryThreshold: number; // MB
}

export interface BatchProcessorConfig {
  maxConcurrentJobs: number;
  defaultBatchSize: number;
  memoryLimit: number; // MB
  enableAdaptiveOptimization: boolean;
  retryFailedPages: boolean;
  maxRetries: number;
  retryDelay: number; // ms
}

export class BatchProcessor {
  private jobs: Map<string, BatchJob> = new Map();
  private activeJobs: Set<string> = new Set();
  private jobQueue: string[] = [];
  private config: BatchProcessorConfig;
  private processingHistory: BatchProcessingStats[] = [];
  private currentOptimization: OptimizationStrategy;

  private static readonly DEFAULT_CONFIG: BatchProcessorConfig = {
    maxConcurrentJobs: 3,
    defaultBatchSize: 10,
    memoryLimit: 512, // MB
    enableAdaptiveOptimization: true,
    retryFailedPages: true,
    maxRetries: 2,
    retryDelay: 1000
  };

  private static readonly DEFAULT_OPTIMIZATION: OptimizationStrategy = {
    batchSize: 10,
    workerCount: 4,
    cacheStrategy: 'conservative',
    priorityQueue: true,
    loadBalancing: 'adaptive',
    memoryThreshold: 256
  };

  constructor(config: Partial<BatchProcessorConfig> = {}) {
    this.config = { ...BatchProcessor.DEFAULT_CONFIG, ...config };
    this.currentOptimization = { ...BatchProcessor.DEFAULT_OPTIMIZATION };
  }

  /**
   * Submit a batch job for processing
   */
  async submitJob(
    searchQueries: SearchQuery[],
    pageObjects: PageObject[],
    options: ProcessingOptions,
    priority: BatchJob['priority'] = 'medium'
  ): Promise<string> {
    const jobId = this.generateJobId();
    const estimatedTime = this.estimateProcessingTime(pageObjects.length, searchQueries.length);

    const job: BatchJob = {
      id: jobId,
      searchQueries,
      pageObjects,
      options,
      priority,
      createdAt: Date.now(),
      estimatedTime
    };

    this.jobs.set(jobId, job);
    this.enqueueJob(jobId);

    console.log(`Batch job ${jobId} submitted with ${pageObjects.length} pages`);
    return jobId;
  }

  /**
   * Process a batch job with optimization
   */
  async processJob(
    jobId: string,
    processor: (
      searchQueries: SearchQuery[],
      pageObjects: PageObject[],
      options: ProcessingOptions,
      onProgress?: (completed: number, total: number) => void
    ) => Promise<AnnotatedPage[]>,
    onProgress?: (jobId: string, completed: number, total: number, stats: Partial<BatchProcessingStats>) => void
  ): Promise<BatchResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (this.activeJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already being processed`);
    }

    this.activeJobs.add(jobId);
    const startTime = performance.now();
    let processedPages = 0;
    let failedPages = 0;

    try {
      // Apply optimization strategy
      const optimizedOptions = this.applyOptimization(job.options, job.pageObjects.length);
      const batches = this.createOptimalBatches(job.pageObjects, job.searchQueries);

      const allResults: AnnotatedPage[] = [];
      let totalProcessingTime = 0;

      // Process batches
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartTime = performance.now();

        try {
          const batchResults = await processor(
            job.searchQueries,
            batch.pageObjects,
            optimizedOptions,
            (completed, total) => {
              const globalCompleted = processedPages + completed;
              const globalTotal = job.pageObjects.length;
              
              if (onProgress) {
                onProgress(jobId, globalCompleted, globalTotal, {
                  totalPages: globalTotal,
                  processedPages: globalCompleted,
                  failedPages,
                  averageTimePerPage: totalProcessingTime / Math.max(1, globalCompleted)
                });
              }
            }
          );

          allResults.push(...batchResults);
          processedPages += batch.pageObjects.length;
          totalProcessingTime += performance.now() - batchStartTime;

        } catch (error) {
          console.error(`Batch ${batchIndex} failed:`, error);
          failedPages += batch.pageObjects.length;

          // Retry failed pages if enabled
          if (this.config.retryFailedPages && batch.retryCount < this.config.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
            batch.retryCount++;
            batchIndex--; // Retry this batch
            continue;
          }
        }

        // Check memory usage and adapt if needed
        if (this.config.enableAdaptiveOptimization) {
          await this.adaptOptimization(allResults.length, performance.now() - startTime);
        }
      }

      const totalTime = performance.now() - startTime;
      const stats = this.calculateStats(job, allResults, totalTime, failedPages);
      
      // Store stats for learning
      this.processingHistory.push(stats);
      if (this.processingHistory.length > 50) {
        this.processingHistory.shift(); // Keep only recent history
      }

      const result: BatchResult = {
        jobId,
        results: allResults,
        stats,
        success: failedPages === 0,
        error: failedPages > 0 ? `${failedPages} pages failed to process` : undefined
      };

      console.log(`Batch job ${jobId} completed: ${processedPages} processed, ${failedPages} failed`);
      return result;

    } catch (error) {
      const totalTime = performance.now() - startTime;
      const stats = this.calculateStats(job, [], totalTime, job.pageObjects.length);

      return {
        jobId,
        results: [],
        stats,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.activeJobs.delete(jobId);
      this.jobs.delete(jobId);
    }
  }

  /**
   * Get processing queue status
   */
  getQueueStatus(): {
    totalJobs: number;
    activeJobs: number;
    queuedJobs: number;
    estimatedWaitTime: number;
    jobs: Array<{
      id: string;
      priority: string;
      pageCount: number;
      estimatedTime: number;
      waitTime: number;
    }>;
  } {
    const now = Date.now();
    const queuedJobDetails = this.jobQueue.map(jobId => {
      const job = this.jobs.get(jobId)!;
      return {
        id: jobId,
        priority: job.priority,
        pageCount: job.pageObjects.length,
        estimatedTime: job.estimatedTime || 0,
        waitTime: now - job.createdAt
      };
    });

    const estimatedWaitTime = queuedJobDetails.reduce((sum, job) => sum + job.estimatedTime, 0);

    return {
      totalJobs: this.jobs.size,
      activeJobs: this.activeJobs.size,
      queuedJobs: this.jobQueue.length,
      estimatedWaitTime,
      jobs: queuedJobDetails
    };
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    if (this.activeJobs.has(jobId)) {
      return false; // Cannot cancel active job
    }

    const queueIndex = this.jobQueue.indexOf(jobId);
    if (queueIndex !== -1) {
      this.jobQueue.splice(queueIndex, 1);
    }

    return this.jobs.delete(jobId);
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): {
    currentStrategy: OptimizationStrategy;
    recommendations: string[];
    performanceMetrics: {
      averageThroughput: number;
      averageEfficiency: number;
      memoryUtilization: number;
    };
  } {
    const recommendations: string[] = [];
    const recentStats = this.processingHistory.slice(-10);

    if (recentStats.length === 0) {
      return {
        currentStrategy: this.currentOptimization,
        recommendations: ['Process more jobs to get optimization recommendations'],
        performanceMetrics: {
          averageThroughput: 0,
          averageEfficiency: 0,
          memoryUtilization: 0
        }
      };
    }

    const avgThroughput = recentStats.reduce((sum, s) => sum + s.throughput, 0) / recentStats.length;
    const avgEfficiency = recentStats.reduce((sum, s) => sum + s.parallelEfficiency, 0) / recentStats.length;
    const avgMemory = recentStats.reduce((sum, s) => sum + s.memoryUsage, 0) / recentStats.length;

    // Generate recommendations
    if (avgEfficiency < 0.7) {
      recommendations.push('Consider reducing worker count or batch size for better efficiency');
    }
    if (avgMemory > this.config.memoryLimit * 0.8) {
      recommendations.push('Memory usage is high, consider smaller batch sizes');
    }
    if (avgThroughput < 1.0) {
      recommendations.push('Low throughput detected, consider enabling parallel processing');
    }

    return {
      currentStrategy: this.currentOptimization,
      recommendations,
      performanceMetrics: {
        averageThroughput: avgThroughput,
        averageEfficiency: avgEfficiency,
        memoryUtilization: avgMemory / this.config.memoryLimit
      }
    };
  }

  // Private methods

  private generateJobId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private enqueueJob(jobId: string): void {
    const job = this.jobs.get(jobId)!;
    
    if (this.currentOptimization.priorityQueue) {
      // Insert based on priority
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      const jobPriority = priorityOrder[job.priority];
      
      let insertIndex = this.jobQueue.length;
      for (let i = 0; i < this.jobQueue.length; i++) {
        const queuedJob = this.jobs.get(this.jobQueue[i])!;
        const queuedPriority = priorityOrder[queuedJob.priority];
        
        if (jobPriority > queuedPriority) {
          insertIndex = i;
          break;
        }
      }
      
      this.jobQueue.splice(insertIndex, 0, jobId);
    } else {
      this.jobQueue.push(jobId);
    }
  }

  private estimateProcessingTime(pageCount: number, queryCount: number): number {
    if (this.processingHistory.length === 0) {
      // Default estimate: 500ms per page per query
      return pageCount * queryCount * 500;
    }

    const avgTimePerPage = this.processingHistory
      .slice(-5)
      .reduce((sum, s) => sum + s.averageTimePerPage, 0) / Math.min(5, this.processingHistory.length);

    return pageCount * queryCount * avgTimePerPage;
  }

  private applyOptimization(options: ProcessingOptions, pageCount: number): ProcessingOptions {
    const optimized = { ...options };

    // Apply memory optimization
    if (pageCount > this.currentOptimization.memoryThreshold) {
      optimized.enableCaching = this.currentOptimization.cacheStrategy !== 'minimal';
    }

    // Apply parallel processing optimization
    if (pageCount > 5 && this.currentOptimization.workerCount > 1) {
      optimized.parallelProcessing = true;
    }

    return optimized;
  }

  private createOptimalBatches(
    pageObjects: PageObject[],
    searchQueries: SearchQuery[]
  ): Array<{ pageObjects: PageObject[]; retryCount: number }> {
    const batchSize = Math.min(
      this.currentOptimization.batchSize,
      Math.max(1, Math.floor(this.currentOptimization.memoryThreshold / searchQueries.length))
    );

    const batches: Array<{ pageObjects: PageObject[]; retryCount: number }> = [];
    
    for (let i = 0; i < pageObjects.length; i += batchSize) {
      const batchPages = pageObjects.slice(i, i + batchSize);
      batches.push({ pageObjects: batchPages, retryCount: 0 });
    }

    return batches;
  }

  private calculateStats(
    job: BatchJob,
    results: AnnotatedPage[],
    totalTime: number,
    failedPages: number
  ): BatchProcessingStats {
    const processedPages = results.length;
    const totalPages = job.pageObjects.length;
    const averageTimePerPage = totalTime / Math.max(1, processedPages);
    
    // Calculate throughput (pages per second)
    const throughput = processedPages / (totalTime / 1000);
    
    // Estimate memory usage (rough calculation)
    const estimatedMemoryUsage = processedPages * 10; // 10MB per page estimate
    
    // Calculate parallel efficiency (simplified)
    const parallelEfficiency = job.options.parallelProcessing 
      ? Math.min(2.0, totalPages / Math.max(1, totalTime / averageTimePerPage))
      : 1.0;

    return {
      totalPages,
      processedPages,
      failedPages,
      totalTime,
      averageTimePerPage,
      parallelEfficiency,
      cacheHitRate: 0, // This would be calculated from actual cache stats
      memoryUsage: estimatedMemoryUsage,
      throughput
    };
  }

  private async adaptOptimization(processedCount: number, elapsedTime: number): Promise<void> {
    if (!this.config.enableAdaptiveOptimization || this.processingHistory.length < 3) {
      return;
    }

    const currentThroughput = processedCount / (elapsedTime / 1000);
    const recentAvgThroughput = this.processingHistory
      .slice(-3)
      .reduce((sum, s) => sum + s.throughput, 0) / 3;

    // Adapt batch size based on performance
    if (currentThroughput < recentAvgThroughput * 0.8) {
      this.currentOptimization.batchSize = Math.max(5, this.currentOptimization.batchSize - 2);
    } else if (currentThroughput > recentAvgThroughput * 1.2) {
      this.currentOptimization.batchSize = Math.min(50, this.currentOptimization.batchSize + 2);
    }

    // Adapt worker count based on efficiency
    const recentAvgEfficiency = this.processingHistory
      .slice(-3)
      .reduce((sum, s) => sum + s.parallelEfficiency, 0) / 3;

    if (recentAvgEfficiency < 0.7 && this.currentOptimization.workerCount > 2) {
      this.currentOptimization.workerCount--;
    } else if (recentAvgEfficiency > 1.5 && this.currentOptimization.workerCount < 8) {
      this.currentOptimization.workerCount++;
    }
  }
}