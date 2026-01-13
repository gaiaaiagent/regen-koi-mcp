/**
 * RLM Types - Type Definitions for Recursive Language Model Tools
 *
 * This module defines TypeScript types for the RLM (Recursive Language Model)
 * implementation that enables dynamic knowledge exploration beyond context limits.
 *
 * @see docs/RLM_DESIGN.md for architecture overview
 * @see https://github.com/gaiaaiagent/regen-koi-mcp/issues/5
 */

// =============================================================================
// Data Source Types
// =============================================================================

/**
 * Supported corpus data sources
 */
export type CorpusSource = 'discourse' | 'notion' | 'github' | 'ledger' | 'all';

/**
 * Model tiers for sub-queries (cost/capability tradeoff)
 */
export type ModelTier = 'haiku' | 'sonnet';

/**
 * Sub-query task types
 */
export type SubQueryTaskType = 'classify' | 'extract' | 'summarize' | 'filter' | 'compare';

// =============================================================================
// Corpus Loading Types
// =============================================================================

/**
 * Filter options for corpus loading
 */
export interface CorpusFilter {
  /** Include documents from this date onwards (ISO 8601) */
  date_from?: string;
  /** Include documents up to this date (ISO 8601) */
  date_to?: string;
  /** Filter by category (source-specific) */
  category?: string;
  /** Full-text search term */
  search_term?: string;
  /** Filter by author/creator */
  author?: string;
  /** Additional source-specific filters */
  extra?: Record<string, unknown>;
}

/**
 * Options for loading a corpus segment
 */
export interface LoadCorpusOptions {
  /** Data source to load from */
  source: CorpusSource;
  /** Optional filters to apply */
  filter?: CorpusFilter;
  /** Page number (1-indexed) */
  page?: number;
  /** Number of documents per page */
  page_size?: number;
  /** Fields to include in response */
  fields?: ('title' | 'content' | 'metadata' | 'embeddings')[];
}

/**
 * Metadata for a loaded document
 */
export interface DocumentMetadata {
  /** Original author/creator */
  author?: string;
  /** Publication/creation date */
  date?: string;
  /** Source-specific category */
  category?: string;
  /** Original URL if applicable */
  url?: string;
  /** RID (Resource Identifier) */
  rid?: string;
  /** Additional source-specific metadata */
  [key: string]: unknown;
}

/**
 * A document in a loaded corpus segment
 */
export interface CorpusDocument {
  /** Unique document ID */
  id: string;
  /** Document title */
  title: string;
  /** Document content (text) */
  content: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Optional embedding vector (if requested) */
  embedding?: number[];
}

/**
 * Provenance tracking for data access
 */
export interface DataProvenance {
  /** Timestamp of query */
  query_timestamp: string;
  /** Source system */
  source: CorpusSource;
  /** Filters that were applied */
  filters_applied: CorpusFilter;
  /** API endpoint used */
  api_endpoint?: string;
  /** Request ID for tracing */
  request_id?: string;
}

/**
 * Result of loading a corpus segment
 */
export interface CorpusSegment {
  /** Unique segment ID for reference */
  segment_id: string;
  /** Source that was queried */
  source: CorpusSource;
  /** Total documents matching filter (before pagination) */
  total_count: number;
  /** Current page number */
  page: number;
  /** Documents per page */
  page_size: number;
  /** Has more pages available */
  has_more: boolean;
  /** Loaded documents */
  documents: CorpusDocument[];
  /** Provenance chain */
  provenance: DataProvenance;
}

// =============================================================================
// Sub-Query Types
// =============================================================================

/**
 * Item to be processed in a sub-query batch
 */
export interface SubQueryItem {
  /** Item identifier */
  id: string;
  /** Item content (inserted into prompt template) */
  content?: string;
  /** Full item data (for complex templates) */
  [key: string]: unknown;
}

/**
 * Options for a sub-query operation
 */
export interface SubQueryOptions {
  /** Type of task to perform */
  task_type: SubQueryTaskType;
  /** Prompt template with {{item}} or {{item.field}} placeholders */
  prompt_template: string;
  /** Items to process (max 100) */
  items: SubQueryItem[];
  /** Expected JSON schema for output validation */
  output_schema?: Record<string, unknown>;
  /** Model tier to use */
  model_tier?: ModelTier;
  /** System prompt override */
  system_prompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
}

/**
 * Single result from a sub-query
 */
export interface SubQueryItemResult {
  /** Original item ID */
  id: string;
  /** Whether processing succeeded */
  success: boolean;
  /** Result data (schema matches output_schema if provided) */
  result?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

/**
 * Token usage tracking for cost estimation
 */
export interface TokenUsage {
  /** Input tokens consumed */
  input_tokens: number;
  /** Output tokens generated */
  output_tokens: number;
  /** Estimated cost in USD */
  cost_estimate_usd: number;
}

/**
 * Provenance for sub-query operations
 */
export interface SubQueryProvenance {
  /** Model used for processing */
  model: string;
  /** Model version/tier */
  model_tier: ModelTier;
  /** Number of items processed */
  batch_size: number;
  /** Processing timestamp */
  timestamp: string;
  /** Prompt template used (for audit) */
  prompt_template_hash?: string;
}

/**
 * Result of a sub-query operation
 */
export interface SubQueryResult {
  /** Individual item results */
  results: SubQueryItemResult[];
  /** Token usage and cost */
  usage: TokenUsage;
  /** Success count */
  success_count: number;
  /** Failure count */
  failure_count: number;
  /** Provenance tracking */
  provenance: SubQueryProvenance;
}

// =============================================================================
// Analysis Execution Types
// =============================================================================

/**
 * Options for executing analysis code
 */
export interface ExecuteAnalysisOptions {
  /** Python code to execute */
  code: string;
  /** Corpus segment IDs to make available */
  segment_ids?: string[];
  /** Sub-query result IDs to make available */
  result_ids?: string[];
  /** Execution timeout in milliseconds */
  timeout_ms?: number;
}

/**
 * Result of analysis execution
 */
export interface AnalysisResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result value (JSON-serializable) */
  result?: unknown;
  /** Standard output from execution */
  stdout?: string;
  /** Standard error from execution */
  stderr?: string;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  execution_time_ms: number;
  /** Provenance */
  provenance: {
    code_hash: string;
    segment_ids: string[];
    timestamp: string;
  };
}

// =============================================================================
// Session State Types
// =============================================================================

/**
 * RLM session state (in-memory or persisted)
 */
export interface RLMSessionState {
  /** Session ID */
  session_id: string;
  /** Session creation timestamp */
  created_at: string;
  /** Last activity timestamp */
  last_activity: string;
  /** Loaded corpus segments (by segment_id) */
  corpus_segments: Map<string, CorpusSegment>;
  /** Sub-query results (by result_id) */
  sub_query_results: Map<string, SubQueryResult>;
  /** Cumulative token usage */
  total_usage: TokenUsage;
  /** Full provenance chain for the session */
  provenance_chain: Array<DataProvenance | SubQueryProvenance>;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * RLM-specific error codes
 */
export enum RLMErrorCode {
  /** Corpus load failed */
  CORPUS_LOAD_FAILED = 'CORPUS_LOAD_FAILED',
  /** Sub-query failed */
  SUB_QUERY_FAILED = 'SUB_QUERY_FAILED',
  /** Analysis execution failed */
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Cost limit exceeded */
  COST_LIMIT_EXCEEDED = 'COST_LIMIT_EXCEEDED',
  /** Session not found */
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  /** Invalid segment ID */
  INVALID_SEGMENT_ID = 'INVALID_SEGMENT_ID',
  /** Sandbox security violation */
  SANDBOX_VIOLATION = 'SANDBOX_VIOLATION',
  /** Timeout exceeded */
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',
}

/**
 * RLM error with structured details
 */
export interface RLMError {
  /** Error code */
  code: RLMErrorCode;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Recoverable (can retry) */
  recoverable: boolean;
}

// =============================================================================
// Tool Response Types (MCP Compatible)
// =============================================================================

/**
 * Standard MCP content item
 */
export interface MCPContentItem {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Standard MCP tool response
 */
export interface MCPToolResponse {
  content: MCPContentItem[];
  isError?: boolean;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Pagination info for API responses
 */
export interface PaginationInfo {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

/**
 * Cost tracking configuration
 */
export interface CostConfig {
  /** Maximum cost per session in USD */
  max_session_cost_usd: number;
  /** Maximum cost per sub-query in USD */
  max_sub_query_cost_usd: number;
  /** Cost per 1M input tokens by model tier */
  input_cost_per_million: Record<ModelTier, number>;
  /** Cost per 1M output tokens by model tier */
  output_cost_per_million: Record<ModelTier, number>;
}

/**
 * Default cost configuration based on current Anthropic pricing
 */
export const DEFAULT_COST_CONFIG: CostConfig = {
  max_session_cost_usd: 1.0,
  max_sub_query_cost_usd: 0.10,
  input_cost_per_million: {
    haiku: 0.25,
    sonnet: 3.00,
  },
  output_cost_per_million: {
    haiku: 1.25,
    sonnet: 15.00,
  },
};

// =============================================================================
// Export All Types
// =============================================================================

export default {
  DEFAULT_COST_CONFIG,
};
