/**
 * Validation Module - Input Validation with Zod Schemas
 *
 * Provides input validation for all MCP tool parameters to prevent
 * injection attacks and ensure data integrity.
 */

import { z } from 'zod';
import { logger } from './logger.js';
import { GRAPH_QUERY_TYPES } from './graph_query_types.js';

/**
 * Safe string - prevents SQL/Cypher injection
 * Allows alphanumeric, underscore, hyphen, dot, and spaces
 */
const SafeString = z.string()
  .min(1, 'Value cannot be empty')
  .max(200, 'Value too long (max 200 characters)')
  .regex(
    /^[a-zA-Z0-9_\-. ]+$/,
    'Invalid characters. Only letters, numbers, underscores, hyphens, dots, and spaces allowed.'
  );

/**
 * Safe identifier - for entity names, type names, etc.
 * More restrictive than SafeString
 */
const SafeIdentifier = z.string()
  .min(1, 'Identifier cannot be empty')
  .max(100, 'Identifier too long (max 100 characters)')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    'Invalid identifier. Must start with a letter and contain only letters, numbers, and underscores.'
  );

/**
 * Safe path - for file paths
 * Prevents path traversal attacks
 */
const SafePath = z.string()
  .min(1, 'Path cannot be empty')
  .max(500, 'Path too long (max 500 characters)')
  .refine(
    (val) => !val.includes('..') && !val.includes('\0'),
    'Invalid path. Path traversal not allowed.'
  );

/**
 * Query type enum
 */
const QueryTypeEnum = z.enum(GRAPH_QUERY_TYPES);

/**
 * Repository enum
 */
const RepositoryEnum = z.enum([
  'regen-ledger',
  'regen-web',
  'regen-data-standards',
  'regenie-corpus',
  'koi-sensors'
]);

/**
 * Schema for query_code_graph tool
 */
export const QueryCodeGraphSchema = z.object({
  query_type: QueryTypeEnum,
  entity_name: SafeString.optional(),
  entity_type: SafeIdentifier.optional(),
  doc_path: SafePath.optional(),
  repo_name: z.string().max(100).optional(),
  module_name: SafeString.optional()
}).refine(
  (data) => {
    // Validate required fields based on query type
    const requiresEntityName = [
      'keeper_for_msg',
      'msgs_for_keeper',
      'related_entities',
      'search_entities',
      'search_modules',
      'module_for_entity',
      'explain_concept',
      'find_concept_for_query',
      'find_callers',
      'find_callees',
      'find_call_graph'
    ];
    const requiresDocPath: string[] = [];
    const requiresEntityType = ['find_by_type'];
    const requiresModuleName = ['get_module', 'module_entities'];

    if (requiresEntityName.includes(data.query_type) && !data.entity_name) {
      return false;
    }
    if (requiresDocPath.includes(data.query_type) && !data.doc_path) {
      return false;
    }
    if (requiresEntityType.includes(data.query_type) && !data.entity_type) {
      return false;
    }
    if (requiresModuleName.includes(data.query_type) && !data.module_name) {
      return false;
    }

    return true;
  },
  {
    message: 'Required parameter missing for this query type'
  }
);

/**
 * Schema for search tool
 */
export const SearchSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)'),
  source: z.string()
    .max(100, 'Source too long (max 100 characters)')
    .optional(),
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .optional()
    .default(10),
  published_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  published_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  include_undated: z.boolean().optional().default(false),
  sort_by: z.enum(['relevance', 'date_desc', 'date_asc']).optional().default('relevance')
});

// Alias for backwards compatibility
export const SearchKnowledgeSchema = SearchSchema;

/**
 * Schema for hybrid_search tool
 */
export const HybridSearchSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)'),
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .optional()
    .default(10)
});

/**
 * Schema for search_github_docs tool
 */
export const SearchGithubDocsSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(300, 'Query too long (max 300 characters)'),
  repository: RepositoryEnum.optional(),
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(20, 'Limit cannot exceed 20')
    .optional()
    .default(10)
});

/**
 * Schema for get_repo_overview tool
 */
export const GetRepoOverviewSchema = z.object({
  repository: RepositoryEnum
});

/**
 * Schema for get_tech_stack tool
 */
export const GetTechStackSchema = z.object({
  repository: RepositoryEnum.optional()
});

/**
 * Schema for get_stats tool
 */
export const GetStatsSchema = z.object({
  detailed: z.boolean().optional().default(false)
});

/**
 * Schema for generate_weekly_digest tool
 */
export const GenerateWeeklyDigestSchema = z.object({
  start_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  end_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  save_to_file: z.boolean().optional().default(false),
  output_path: SafePath.optional(),
  format: z.enum(['markdown', 'json']).optional().default('markdown')
});

/**
 * Schema for submit_feedback tool
 */
export const SubmitFeedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  category: z.enum(['success', 'partial', 'bug', 'suggestion', 'question', 'other']),
  task_description: z.string().optional(),
  notes: z.string().min(1).max(5000),
  include_session_context: z.boolean().optional().default(true),
});

/**
 * Schema for sparql_query tool
 * Note: We don't over-restrict the query string to allow valid SPARQL syntax
 */
export const SparqlQuerySchema = z.object({
  query: z.string()
    .min(10, 'Query too short (min 10 characters)')
    .max(5000, 'Query too long (max 5000 characters)')
    .refine(
      (q) => {
        const lower = q.toLowerCase();

        // Hard block query federation and update/mutation operations.
        // NOTE: We keep this conservative because SPARQL SERVICE can trigger server-side network access.
        const forbiddenKeywords = [
          'delete',
          'insert',
          'drop',
          'create',
          'clear',
          'load',
          'service',
          'add',
          'move',
          'copy'
        ];
        for (const kw of forbiddenKeywords) {
          if (lower.includes(kw)) return false;
        }

        // Enforce SELECT-only (allow PREFIX/BASE/comment lines before the SELECT).
        const lines = q
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('#'));

        // Drop leading PREFIX/BASE declarations.
        let i = 0;
        while (i < lines.length) {
          const l = lines[i].toLowerCase();
          if (l.startsWith('prefix ') || l.startsWith('base ')) {
            i += 1;
            continue;
          }
          break;
        }

        const firstNonPrefix = (lines[i] || '').toLowerCase();
        return firstNonPrefix.startsWith('select ');
      },
      'Only SELECT queries are allowed. Forbidden: SERVICE/LOAD and any mutation keywords (DELETE, INSERT, DROP, CREATE, CLEAR, ADD, MOVE, COPY).'
    ),
  format: z.enum(['json', 'table']).optional().default('json'),
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit cannot exceed 1000')
    .optional()
    .default(100),
  timeout_ms: z.number()
    .int()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(60000, 'Timeout cannot exceed 60000ms')
    .optional()
    .default(30000)
});

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: z.ZodIssue[];
}

/**
 * Validate input against a schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  toolName: string
): ValidationResult<T> {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      const errorMessage = zodError.issues
        .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');

      logger.warn({
        action: 'validation_failed',
        tool: toolName,
        errors: zodError.issues
      }, `Validation failed for ${toolName}: ${errorMessage}`);

      return {
        success: false,
        error: `Validation failed: ${errorMessage}`,
        details: zodError.issues
      };
    }

    logger.error({
      action: 'validation_error',
      tool: toolName,
      error: error instanceof Error ? error.message : String(error)
    }, `Unexpected validation error for ${toolName}`);

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Map of tool names to their schemas
 */
export const ToolSchemas: Record<string, z.ZodSchema<any>> = {
  query_code_graph: QueryCodeGraphSchema,
  search: SearchSchema,
  search_knowledge: SearchKnowledgeSchema, // Alias for backwards compatibility
  hybrid_search: HybridSearchSchema,
  search_github_docs: SearchGithubDocsSchema,
  get_repo_overview: GetRepoOverviewSchema,
  get_tech_stack: GetTechStackSchema,
  get_stats: GetStatsSchema,
  generate_weekly_digest: GenerateWeeklyDigestSchema,
  sparql_query: SparqlQuerySchema,
  submit_feedback: SubmitFeedbackSchema
};

/**
 * Validate tool input by tool name
 */
export function validateToolInput(
  toolName: string,
  input: unknown
): ValidationResult<any> {
  const schema = ToolSchemas[toolName];

  if (!schema) {
    logger.debug({
      action: 'no_validation_schema',
      tool: toolName
    }, `No validation schema defined for ${toolName}, passing through`);
    return { success: true, data: input };
  }

  return validateInput(schema, input, toolName);
}

/**
 * Sanitize a string for safe use in queries
 * Removes potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[;'"\\]/g, '')  // Remove SQL/Cypher injection characters
    .replace(/\\/g, '')        // Remove backslashes
    .replace(/\x00/g, '')      // Remove null bytes
    .trim();
}

/**
 * Check if a string looks like an injection attempt
 */
export function detectInjection(input: string): boolean {
  const patterns = [
    /(\bor\b|\band\b)\s*\d*\s*=\s*\d*/i,  // SQL OR 1=1
    /--/,                                   // SQL comment
    /\/\*/,                                 // Block comment
    /;\s*(drop|delete|update|insert)/i,    // SQL commands
    /\$\$/,                                 // Cypher parameter injection
    /\}\s*\)/,                              // Cypher escape
  ];

  return patterns.some(pattern => pattern.test(input));
}

export default {
  validateInput,
  validateToolInput,
  sanitizeString,
  detectInjection,
  QueryCodeGraphSchema,
  SearchSchema,
  SearchKnowledgeSchema,
  HybridSearchSchema,
  SearchGithubDocsSchema,
  GetRepoOverviewSchema,
  GetTechStackSchema,
  GetStatsSchema,
  GenerateWeeklyDigestSchema,
  SparqlQuerySchema,
  SubmitFeedbackSchema
};
