/**
 * Resilience Module - Retry Logic, Circuit Breaker, Timeouts
 *
 * Provides utilities for making the MCP server fault-tolerant:
 * - Exponential backoff retry for transient failures
 * - Circuit breaker to prevent cascading failures
 * - Timeout wrapper for long-running operations
 */

import { logger, logCircuitBreaker } from './logger.js';
import { recordCircuitBreak } from './metrics.js';

/**
 * Check if an error is retriable (transient failure)
 */
export function isRetriableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED') return true;
  if (error.code === 'ECONNRESET') return true;
  if (error.code === 'ETIMEDOUT') return true;
  if (error.code === 'ENOTFOUND') return true;

  // HTTP status codes that are retriable
  if (error.response?.status) {
    const status = error.response.status;
    // 5xx server errors (except 501 Not Implemented)
    if (status >= 500 && status !== 501) return true;
    // 429 Too Many Requests (rate limited)
    if (status === 429) return true;
    // 408 Request Timeout
    if (status === 408) return true;
  }

  // Axios network errors
  if (error.code === 'ERR_NETWORK') return true;

  // PostgreSQL connection errors
  if (error.code === '57P01') return true; // admin_shutdown
  if (error.code === '57P02') return true; // crash_shutdown
  if (error.code === '57P03') return true; // cannot_connect_now

  return false;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Options for retry logic
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  shouldRetry: isRetriableError,
  onRetry: () => {}
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt > opts.maxRetries || !opts.shouldRetry(error)) {
        throw error;
      }

      // Log retry attempt
      logger.warn({
        action: 'retry',
        attempt,
        max_retries: opts.maxRetries,
        delay_ms: delay,
        error: error instanceof Error ? error.message : String(error)
      }, `Retrying after error (attempt ${attempt}/${opts.maxRetries})`);

      // Call onRetry callback
      opts.onRetry(error, attempt, delay);

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Circuit Breaker State
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit Breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;  // Number of failures before opening circuit
  resetTimeoutMs?: number;    // Time to wait before trying again (half-open)
  halfOpenMaxCalls?: number;  // Max calls in half-open state
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

const DEFAULT_CIRCUIT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
  onStateChange: () => {}
};

/**
 * Circuit Breaker class for preventing cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private halfOpenCalls: number = 0;
  private options: Required<CircuitBreakerOptions>;
  private serviceName: string;

  constructor(serviceName: string, options: CircuitBreakerOptions = {}) {
    this.serviceName = serviceName;
    this.options = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime.getTime();
      if (elapsed >= this.options.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;

      // Reset counters on state change
      if (newState === 'half-open') {
        this.halfOpenCalls = 0;
      } else if (newState === 'closed') {
        this.failureCount = 0;
        this.successCount = 0;
      }

      // Log state change
      logCircuitBreaker({
        state: newState,
        service: this.serviceName,
        failure_count: this.failureCount,
        reset_at: newState === 'open'
          ? new Date(Date.now() + this.options.resetTimeoutMs)
          : undefined
      });

      // Callback
      this.options.onStateChange(oldState, newState);
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    // If circuit is open, fail fast
    if (state === 'open') {
      throw new CircuitBreakerError(
        `Circuit breaker is open for ${this.serviceName}. Try again later.`,
        this.serviceName,
        this.lastFailureTime
          ? new Date(this.lastFailureTime.getTime() + this.options.resetTimeoutMs)
          : new Date(Date.now() + this.options.resetTimeoutMs)
      );
    }

    // If half-open, limit concurrent calls
    if (state === 'half-open') {
      if (this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
        throw new CircuitBreakerError(
          `Circuit breaker is half-open for ${this.serviceName}. Waiting for test calls to complete.`,
          this.serviceName
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  private recordSuccess(): void {
    this.successCount++;

    if (this.state === 'half-open') {
      // In half-open, successes move us back to closed
      this.transitionTo('closed');
    } else if (this.state === 'closed') {
      // In closed, successes reduce failure count
      if (this.failureCount > 0) {
        this.failureCount--;
      }
    }
  }

  /**
   * Record a failed call
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      // In half-open, any failure reopens the circuit
      this.transitionTo('open');
      recordCircuitBreak();
    } else if (this.state === 'closed') {
      // In closed, check if we've hit the threshold
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo('open');
        recordCircuitBreak();
      }
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.halfOpenCalls = 0;
  }

  /**
   * Get circuit breaker stats
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailure?: string;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailure: this.lastFailureTime?.toISOString()
    };
  }
}

/**
 * Custom error for circuit breaker open state
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public serviceName: string,
    public retryAfter?: Date
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Custom error for timeouts
 */
export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `${operationName} timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);

    fn()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Combine retry and timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {},
  operationName: string = 'operation'
): Promise<T> {
  return withRetry(
    () => withTimeout(fn, timeoutMs, operationName),
    retryOptions
  );
}

// Create circuit breakers for different services
export const circuitBreakers = {
  graphApi: new CircuitBreaker('graph-api', {
    failureThreshold: 5,
    resetTimeoutMs: 60000
  }),
  koiApi: new CircuitBreaker('koi-api', {
    failureThreshold: 5,
    resetTimeoutMs: 60000
  }),
  database: new CircuitBreaker('database', {
    failureThreshold: 3,
    resetTimeoutMs: 30000
  })
};

export default {
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  CircuitBreaker,
  circuitBreakers,
  isRetriableError
};
