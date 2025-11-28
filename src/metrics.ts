/**
 * Metrics Module - Performance Tracking for KOI MCP Server
 *
 * Tracks query latency, error rates, cache hit rates, and other metrics.
 * Provides in-memory metrics collection with percentile calculations.
 */

import { logger } from './logger.js';

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
}

/**
 * Sliding window for tracking recent values
 */
class SlidingWindow {
  private values: number[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  getValues(): number[] {
    return [...this.values];
  }

  getSorted(): number[] {
    return [...this.values].sort((a, b) => a - b);
  }

  clear(): void {
    this.values = [];
  }

  get length(): number {
    return this.values.length;
  }
}

/**
 * Counter for tracking counts (errors, requests, etc.)
 */
class Counter {
  private value: number = 0;

  increment(amount: number = 1): void {
    this.value += amount;
  }

  getValue(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/**
 * Metrics by tool name
 */
interface ToolMetrics {
  latencies: SlidingWindow;
  successCount: Counter;
  errorCount: Counter;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

/**
 * Main Metrics class - singleton pattern
 */
class Metrics {
  private static instance: Metrics;

  // Per-tool metrics
  private toolMetrics: Map<string, ToolMetrics> = new Map();

  // Cache metrics
  private cacheHits: Counter = new Counter();
  private cacheMisses: Counter = new Counter();

  // Circuit breaker metrics
  private circuitBreaks: Counter = new Counter();

  // API call metrics
  private apiLatencies: SlidingWindow = new SlidingWindow(500);
  private apiErrors: Counter = new Counter();
  private apiCalls: Counter = new Counter();

  // Start time for uptime calculation
  private startTime: Date = new Date();

  private constructor() {}

  static getInstance(): Metrics {
    if (!Metrics.instance) {
      Metrics.instance = new Metrics();
    }
    return Metrics.instance;
  }

  /**
   * Get or create metrics for a specific tool
   */
  private getToolMetrics(toolName: string): ToolMetrics {
    let metrics = this.toolMetrics.get(toolName);
    if (!metrics) {
      metrics = {
        latencies: new SlidingWindow(200),
        successCount: new Counter(),
        errorCount: new Counter()
      };
      this.toolMetrics.set(toolName, metrics);
    }
    return metrics;
  }

  /**
   * Record a query execution
   */
  recordQuery(toolName: string, durationMs: number, success: boolean, errorMessage?: string): void {
    const metrics = this.getToolMetrics(toolName);
    metrics.latencies.add(durationMs);

    if (success) {
      metrics.successCount.increment();
    } else {
      metrics.errorCount.increment();
      metrics.lastError = {
        message: errorMessage || 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(): void {
    this.cacheHits.increment();
  }

  recordCacheMiss(): void {
    this.cacheMisses.increment();
  }

  /**
   * Record circuit breaker open
   */
  recordCircuitBreak(): void {
    this.circuitBreaks.increment();
  }

  /**
   * Record API call
   */
  recordApiCall(durationMs: number, success: boolean): void {
    this.apiLatencies.add(durationMs);
    this.apiCalls.increment();
    if (!success) {
      this.apiErrors.increment();
    }
  }

  /**
   * Get metrics for a specific tool
   */
  getToolStats(toolName: string): {
    total_queries: number;
    success_rate: number;
    error_count: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    avg_latency_ms: number;
    last_error?: { message: string; timestamp: string };
  } {
    const metrics = this.getToolMetrics(toolName);
    const sorted = metrics.latencies.getSorted();
    const totalQueries = metrics.successCount.getValue() + metrics.errorCount.getValue();

    const avgLatency = sorted.length > 0
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length
      : 0;

    return {
      total_queries: totalQueries,
      success_rate: totalQueries > 0
        ? metrics.successCount.getValue() / totalQueries
        : 1,
      error_count: metrics.errorCount.getValue(),
      p50_latency_ms: percentile(sorted, 50),
      p95_latency_ms: percentile(sorted, 95),
      p99_latency_ms: percentile(sorted, 99),
      avg_latency_ms: Math.round(avgLatency * 100) / 100,
      last_error: metrics.lastError ? {
        message: metrics.lastError.message,
        timestamp: metrics.lastError.timestamp.toISOString()
      } : undefined
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    hit_rate: number;
  } {
    const hits = this.cacheHits.getValue();
    const misses = this.cacheMisses.getValue();
    const total = hits + misses;

    return {
      hits,
      misses,
      hit_rate: total > 0 ? hits / total : 0
    };
  }

  /**
   * Get API statistics
   */
  getApiStats(): {
    total_calls: number;
    error_rate: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
  } {
    const sorted = this.apiLatencies.getSorted();
    const totalCalls = this.apiCalls.getValue();

    return {
      total_calls: totalCalls,
      error_rate: totalCalls > 0
        ? this.apiErrors.getValue() / totalCalls
        : 0,
      p50_latency_ms: percentile(sorted, 50),
      p95_latency_ms: percentile(sorted, 95),
      p99_latency_ms: percentile(sorted, 99)
    };
  }

  /**
   * Get all metrics as a summary object
   */
  getSummary(): {
    uptime_seconds: number;
    tools: Record<string, ReturnType<Metrics['getToolStats']>>;
    cache: ReturnType<Metrics['getCacheStats']>;
    api: ReturnType<Metrics['getApiStats']>;
    circuit_breaks: number;
  } {
    const tools: Record<string, ReturnType<Metrics['getToolStats']>> = {};

    for (const [toolName] of this.toolMetrics) {
      tools[toolName] = this.getToolStats(toolName);
    }

    return {
      uptime_seconds: Math.round((Date.now() - this.startTime.getTime()) / 1000),
      tools,
      cache: this.getCacheStats(),
      api: this.getApiStats(),
      circuit_breaks: this.circuitBreaks.getValue()
    };
  }

  /**
   * Format metrics as markdown for display
   */
  formatAsMarkdown(): string {
    const summary = this.getSummary();
    let md = `# KOI MCP Server Metrics\n\n`;
    md += `**Uptime:** ${summary.uptime_seconds}s\n\n`;

    md += `## Cache\n`;
    md += `- Hit Rate: ${(summary.cache.hit_rate * 100).toFixed(1)}%\n`;
    md += `- Hits: ${summary.cache.hits} | Misses: ${summary.cache.misses}\n\n`;

    md += `## API Calls\n`;
    md += `- Total: ${summary.api.total_calls}\n`;
    md += `- Error Rate: ${(summary.api.error_rate * 100).toFixed(2)}%\n`;
    md += `- Latency: p50=${summary.api.p50_latency_ms}ms, p95=${summary.api.p95_latency_ms}ms, p99=${summary.api.p99_latency_ms}ms\n\n`;

    if (Object.keys(summary.tools).length > 0) {
      md += `## Tools\n\n`;
      md += `| Tool | Queries | Success Rate | p95 Latency |\n`;
      md += `|------|---------|--------------|-------------|\n`;

      for (const [toolName, stats] of Object.entries(summary.tools)) {
        md += `| ${toolName} | ${stats.total_queries} | ${(stats.success_rate * 100).toFixed(1)}% | ${stats.p95_latency_ms}ms |\n`;
      }
    }

    if (summary.circuit_breaks > 0) {
      md += `\n## Circuit Breaker\n`;
      md += `- Circuit Breaks: ${summary.circuit_breaks}\n`;
    }

    return md;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.toolMetrics.clear();
    this.cacheHits = new Counter();
    this.cacheMisses = new Counter();
    this.circuitBreaks = new Counter();
    this.apiLatencies = new SlidingWindow(500);
    this.apiErrors = new Counter();
    this.apiCalls = new Counter();
    this.startTime = new Date();
  }
}

// Export singleton instance
export const metrics = Metrics.getInstance();

// Export convenience functions
export function recordQuery(toolName: string, durationMs: number, success: boolean, errorMessage?: string): void {
  metrics.recordQuery(toolName, durationMs, success, errorMessage);
}

export function recordCacheHit(): void {
  metrics.recordCacheHit();
}

export function recordCacheMiss(): void {
  metrics.recordCacheMiss();
}

export function recordCircuitBreak(): void {
  metrics.recordCircuitBreak();
}

export function recordApiCall(durationMs: number, success: boolean): void {
  metrics.recordApiCall(durationMs, success);
}

export function getMetricsSummary() {
  return metrics.getSummary();
}

export function getMetricsMarkdown(): string {
  return metrics.formatAsMarkdown();
}

export default metrics;
