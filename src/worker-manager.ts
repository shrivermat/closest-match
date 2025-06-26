/**
 * Worker Manager for Document Annotator
 * Manages Web Workers for parallel processing of document pages
 * Provides load balancing and task distribution
 */

export interface WorkerTask {
  id: string;
  type: 'process_page' | 'find_matches' | 'extract_hocr';
  data: any;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
}

export interface WorkerStatus {
  id: string;
  busy: boolean;
  currentTask?: string;
  tasksCompleted: number;
  averageTaskTime: number;
  lastActiveTime: number;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  workerScript: string;
  taskTimeout: number;
  retryAttempts: number;
  loadBalancing: 'round_robin' | 'least_busy' | 'fastest';
}

export class WorkerManager {
  private workers: Worker[] = [];
  private workerStatus: Map<string, WorkerStatus> = new Map();
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, { 
    task: WorkerTask; 
    worker: Worker; 
    startTime: number;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private config: WorkerPoolConfig;
  private nextWorkerId = 0;

  private static readonly DEFAULT_CONFIG: WorkerPoolConfig = {
    maxWorkers: Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4)),
    workerScript: '/dist/document-worker.js',
    taskTimeout: 30000, // 30 seconds
    retryAttempts: 2,
    loadBalancing: 'least_busy'
  };

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = { ...WorkerManager.DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.workers.length > 0) {
      return; // Already initialized
    }

    for (let i = 0; i < this.config.maxWorkers; i++) {
      await this.createWorker();
    }

    console.log(`Worker pool initialized with ${this.workers.length} workers`);
  }

  /**
   * Submit a task to the worker pool
   */
  async submitTask<T = any>(
    type: WorkerTask['type'],
    data: any,
    priority: WorkerTask['priority'] = 'medium'
  ): Promise<T> {
    const task: WorkerTask = {
      id: this.generateTaskId(),
      type,
      data,
      priority,
      timestamp: Date.now()
    };

    return new Promise<T>((resolve, reject) => {
      const availableWorker = this.getAvailableWorker();
      
      if (availableWorker) {
        this.executeTask(task, availableWorker, (result: WorkerResult) => {
          resolve(result.data as T);
        }, reject);
      } else {
        // Add to queue with priority sorting
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        // Store the promise handlers for later execution
        this.activeTasks.set(task.id, {
          task,
          worker: null as any,
          startTime: 0,
          resolve: (result: WorkerResult) => resolve(result.data as T),
          reject
        });
      }
    });
  }

  /**
   * Process multiple tasks in parallel
   */
  async processBatch<T = any>(
    tasks: Array<{ type: WorkerTask['type']; data: any; priority?: WorkerTask['priority'] }>,
    onProgress?: (completed: number, total: number, result?: T) => void
  ): Promise<T[]> {
    const results: T[] = [];
    const promises: Promise<T>[] = [];
    let completed = 0;

    for (const taskData of tasks) {
      const promise = this.submitTask<T>(
        taskData.type,
        taskData.data,
        taskData.priority || 'medium'
      ).then(result => {
        completed++;
        results[promises.length - 1] = result;
        
        if (onProgress) {
          onProgress(completed, tasks.length, result);
        }
        
        return result;
      });

      promises.push(promise);
    }

    return Promise.all(promises);
  }

  /**
   * Get worker pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    queuedTasks: number;
    activeTasks: number;
    completedTasks: number;
    averageTaskTime: number;
    workerUtilization: number;
  } {
    const busyWorkers = Array.from(this.workerStatus.values()).filter(status => status.busy).length;
    const totalCompleted = Array.from(this.workerStatus.values()).reduce((sum, status) => sum + status.tasksCompleted, 0);
    const totalTaskTime = Array.from(this.workerStatus.values()).reduce((sum, status) => sum + (status.averageTaskTime * status.tasksCompleted), 0);

    return {
      totalWorkers: this.workers.length,
      busyWorkers,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      completedTasks: totalCompleted,
      averageTaskTime: totalCompleted > 0 ? totalTaskTime / totalCompleted : 0,
      workerUtilization: this.workers.length > 0 ? busyWorkers / this.workers.length : 0
    };
  }

  /**
   * Terminate all workers and clean up
   */
  async terminate(): Promise<void> {
    // Cancel all active tasks
    for (const [taskId, taskInfo] of this.activeTasks) {
      taskInfo.reject(new Error('Worker pool terminated'));
    }
    this.activeTasks.clear();
    this.taskQueue.length = 0;

    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers.length = 0;
    this.workerStatus.clear();

    console.log('Worker pool terminated');
  }

  /**
   * Scale the worker pool
   */
  async scaleWorkers(newSize: number): Promise<void> {
    const currentSize = this.workers.length;
    
    if (newSize > currentSize) {
      // Add workers
      for (let i = currentSize; i < newSize; i++) {
        await this.createWorker();
      }
    } else if (newSize < currentSize) {
      // Remove workers (terminate idle ones first)
      const workersToRemove = currentSize - newSize;
      let removed = 0;

      for (let i = this.workers.length - 1; i >= 0 && removed < workersToRemove; i--) {
        const worker = this.workers[i];
        const workerId = this.getWorkerId(worker);
        const status = this.workerStatus.get(workerId);

        if (status && !status.busy) {
          worker.terminate();
          this.workers.splice(i, 1);
          this.workerStatus.delete(workerId);
          removed++;
        }
      }
    }

    this.config.maxWorkers = newSize;
    console.log(`Worker pool scaled to ${this.workers.length} workers`);
  }

  // Private methods

  private async createWorker(): Promise<void> {
    try {
      const worker = new Worker(this.config.workerScript);
      const workerId = `worker_${this.nextWorkerId++}`;
      
      this.workerStatus.set(workerId, {
        id: workerId,
        busy: false,
        tasksCompleted: 0,
        averageTaskTime: 0,
        lastActiveTime: Date.now()
      });

      worker.onmessage = (event) => this.handleWorkerMessage(worker, event);
      worker.onerror = (error) => this.handleWorkerError(worker, error);
      
      // Set worker ID for identification
      (worker as any)._workerId = workerId;
      
      this.workers.push(worker);
      
      // Test worker with a ping
      await this.testWorker(worker);
      
    } catch (error) {
      console.error('Failed to create worker:', error);
      throw error;
    }
  }

  private async testWorker(worker: Worker): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker test timeout'));
      }, 5000);

      const testHandler = (event: MessageEvent) => {
        if (event.data.type === 'ping_response') {
          clearTimeout(timeout);
          worker.removeEventListener('message', testHandler);
          resolve();
        }
      };

      worker.addEventListener('message', testHandler);
      worker.postMessage({ type: 'ping' });
    });
  }

  private getAvailableWorker(): Worker | null {
    switch (this.config.loadBalancing) {
      case 'round_robin':
        return this.getRoundRobinWorker();
      case 'least_busy':
        return this.getLeastBusyWorker();
      case 'fastest':
        return this.getFastestWorker();
      default:
        return this.getLeastBusyWorker();
    }
  }

  private getRoundRobinWorker(): Worker | null {
    for (const worker of this.workers) {
      const workerId = this.getWorkerId(worker);
      const status = this.workerStatus.get(workerId);
      if (status && !status.busy) {
        return worker;
      }
    }
    return null;
  }

  private getLeastBusyWorker(): Worker | null {
    let leastBusyWorker: Worker | null = null;
    let minTasks = Infinity;

    for (const worker of this.workers) {
      const workerId = this.getWorkerId(worker);
      const status = this.workerStatus.get(workerId);
      
      if (status && !status.busy && status.tasksCompleted < minTasks) {
        minTasks = status.tasksCompleted;
        leastBusyWorker = worker;
      }
    }

    return leastBusyWorker;
  }

  private getFastestWorker(): Worker | null {
    let fastestWorker: Worker | null = null;
    let minAvgTime = Infinity;

    for (const worker of this.workers) {
      const workerId = this.getWorkerId(worker);
      const status = this.workerStatus.get(workerId);
      
      if (status && !status.busy) {
        const avgTime = status.averageTaskTime || 0;
        if (avgTime < minAvgTime) {
          minAvgTime = avgTime;
          fastestWorker = worker;
        }
      }
    }

    return fastestWorker || this.getLeastBusyWorker();
  }

  private executeTask(
    task: WorkerTask,
    worker: Worker,
    resolve: (result: WorkerResult) => void,
    reject: (error: Error) => void
  ): void {
    const workerId = this.getWorkerId(worker);
    const status = this.workerStatus.get(workerId);
    
    if (status) {
      status.busy = true;
      status.lastActiveTime = Date.now();
    }

    const startTime = Date.now();
    
    this.activeTasks.set(task.id, {
      task,
      worker,
      startTime,
      resolve,
      reject
    });

    // Set task timeout
    const timeout = setTimeout(() => {
      this.handleTaskTimeout(task.id);
    }, this.config.taskTimeout);

    // Store timeout for cleanup
    (worker as any)[`_timeout_${task.id}`] = timeout;

    worker.postMessage({
      type: 'execute_task',
      taskId: task.id,
      taskType: task.type,
      data: task.data
    });
  }

  private handleWorkerMessage(worker: Worker, event: MessageEvent): void {
    const { type, taskId, success, data, error } = event.data;

    if (type === 'task_complete') {
      this.handleTaskComplete(taskId, { taskId, success, data, error, processingTime: 0 });
    } else if (type === 'ping_response') {
      // Handled by test worker
    }
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    console.error('Worker error:', error);
    
    // Find and reject any active tasks for this worker
    for (const [taskId, taskInfo] of this.activeTasks) {
      if (taskInfo.worker === worker) {
        taskInfo.reject(new Error(`Worker error: ${error.message}`));
        this.activeTasks.delete(taskId);
      }
    }

    // Recreate the worker
    this.recreateWorker(worker);
  }

  private handleTaskComplete(taskId: string, result: WorkerResult): void {
    const taskInfo = this.activeTasks.get(taskId);
    
    if (!taskInfo) {
      return; // Task already handled or timed out
    }

    const { worker, startTime, resolve, reject } = taskInfo;
    const workerId = this.getWorkerId(worker);
    const status = this.workerStatus.get(workerId);

    // Calculate processing time
    result.processingTime = Date.now() - startTime;

    // Update worker status
    if (status) {
      status.busy = false;
      status.tasksCompleted++;
      status.averageTaskTime = (status.averageTaskTime * (status.tasksCompleted - 1) + result.processingTime) / status.tasksCompleted;
      status.lastActiveTime = Date.now();
    }

    // Clear timeout
    const timeout = (worker as any)[`_timeout_${taskId}`];
    if (timeout) {
      clearTimeout(timeout);
      delete (worker as any)[`_timeout_${taskId}`];
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Resolve or reject the promise
    if (result.success) {
      resolve(result);
    } else {
      reject(new Error(result.error || 'Task failed'));
    }

    // Process next task in queue
    this.processNextTask(worker);
  }

  private handleTaskTimeout(taskId: string): void {
    const taskInfo = this.activeTasks.get(taskId);
    
    if (!taskInfo) {
      return;
    }

    console.warn(`Task ${taskId} timed out`);
    
    taskInfo.reject(new Error('Task timeout'));
    this.activeTasks.delete(taskId);
    
    // Recreate the worker as it may be stuck
    this.recreateWorker(taskInfo.worker);
  }

  private processNextTask(worker: Worker): void {
    if (this.taskQueue.length === 0) {
      return;
    }

    const task = this.taskQueue.shift()!;
    const taskInfo = this.activeTasks.get(task.id);
    
    if (taskInfo) {
      this.executeTask(task, worker, taskInfo.resolve, taskInfo.reject);
    }
  }

  private async recreateWorker(oldWorker: Worker): Promise<void> {
    const workerId = this.getWorkerId(oldWorker);
    
    // Remove old worker
    const index = this.workers.indexOf(oldWorker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
    this.workerStatus.delete(workerId);
    
    try {
      oldWorker.terminate();
    } catch (error) {
      // Ignore termination errors
    }

    // Create new worker
    try {
      await this.createWorker();
    } catch (error) {
      console.error('Failed to recreate worker:', error);
    }
  }

  private getWorkerId(worker: Worker): string {
    return (worker as any)._workerId || 'unknown';
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}