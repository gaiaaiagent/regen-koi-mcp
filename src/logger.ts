/**
 * Logger Module - Structured Logging for KOI MCP Server
 *
 * Uses pino for fast, structured JSON logging.
 * Logs to stderr to avoid interfering with MCP stdio transport.
 */

import pino from 'pino';

// Configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'regen-koi';

// Create the logger instance
// MCP uses stdio, so we log to stderr to avoid protocol interference
export const logger = pino({
  name: SERVER_NAME,
  level: LOG_LEVEL,
  // Output to stderr (fd: 2) to avoid MCP stdio conflicts
  transport: {
    target: 'pino/file',
    options: { destination: 2 } // stderr
  },
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}) // Remove pid and hostname for cleaner logs
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Custom serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    // Custom serializer for query parameters
    params: (params: any) => {
      if (!params) return undefined;
      // Redact sensitive fields if any
      const safe = { ...params };
      if (safe.password) safe.password = '[REDACTED]';
      if (safe.api_key) safe.api_key = '[REDACTED]';
      return safe;
    }
  }
});

/**
 * Create a child logger with context (e.g., for a specific tool or request)
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log a query execution with timing
 */
export function logQuery(opts: {
  tool: string;
  query_type?: string;
  params?: Record<string, any>;
  duration_ms: number;
  result_count?: number;
  success?: boolean;
  error?: string;
  cached?: boolean;
  via?: string;
}) {
  const { tool, query_type, params, duration_ms, result_count, success = true, error, cached, via } = opts;

  const logData = {
    action: 'query',
    tool,
    query_type,
    params,
    duration_ms,
    result_count,
    cached: cached || false,
    via
  };

  if (success) {
    logger.info(logData, `Query completed: ${tool}${query_type ? `/${query_type}` : ''}`);
  } else {
    logger.error({ ...logData, error }, `Query failed: ${tool}${query_type ? `/${query_type}` : ''}`);
  }
}

/**
 * Log an API call
 */
export function logApiCall(opts: {
  endpoint: string;
  method: string;
  duration_ms: number;
  status?: number;
  success: boolean;
  error?: string;
}) {
  const { endpoint, method, duration_ms, status, success, error } = opts;

  const logData = {
    action: 'api_call',
    endpoint,
    method,
    duration_ms,
    status
  };

  if (success) {
    logger.info(logData, `API call succeeded: ${method} ${endpoint}`);
  } else {
    logger.error({ ...logData, error }, `API call failed: ${method} ${endpoint}`);
  }
}

/**
 * Log cache operations
 */
export function logCacheOp(opts: {
  operation: 'hit' | 'miss' | 'set' | 'evict';
  key: string;
  ttl_ms?: number;
}) {
  logger.debug({
    action: 'cache',
    ...opts
  }, `Cache ${opts.operation}: ${opts.key.substring(0, 50)}`);
}

/**
 * Log circuit breaker state changes
 */
export function logCircuitBreaker(opts: {
  state: 'open' | 'closed' | 'half-open';
  service: string;
  failure_count?: number;
  reset_at?: Date;
}) {
  const level = opts.state === 'open' ? 'warn' : 'info';
  logger[level]({
    action: 'circuit_breaker',
    ...opts,
    reset_at: opts.reset_at?.toISOString()
  }, `Circuit breaker ${opts.state} for ${opts.service}`);
}

/**
 * Log startup information
 */
export function logStartup(config: {
  version: string;
  api_endpoint: string;
  graph_db_configured: boolean;
}) {
  logger.info({
    action: 'startup',
    ...config
  }, `KOI MCP Server starting v${config.version}`);
}

/**
 * Log health check results
 */
export function logHealthCheck(checks: Record<string, boolean>) {
  const allHealthy = Object.values(checks).every(v => v);
  const level = allHealthy ? 'info' : 'warn';

  logger[level]({
    action: 'health_check',
    checks,
    healthy: allHealthy
  }, `Health check: ${allHealthy ? 'HEALTHY' : 'DEGRADED'}`);
}

export default logger;
