/**
 * Validation Module - Input Validation with Zod Schemas
 *
 * Provides input validation for all MCP tool parameters to prevent
 * injection attacks and ensure data integrity.
 */

import { z } from 'zod';
import { logger } from './logger.js';

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
const QueryTypeEnum = z.enum([
  'keeper_for_msg',
  'msgs_for_keeper',
  'docs_mentioning',
  'entities_in_doc',
  'related_entities',
  'find_by_type',
  'search_entities',
  'list_repos',
  'list_entity_types',
  'get_entity_stats',
  'list_modules',
  'get_module',
  'search_modules',
  'module_entities',
  'module_for_entity'
]);

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
      'docs_mentioning',
      'related_entities',
      'search_entities',
      'search_modules',
      'module_for_entity'
    ];
    const requiresDocPath = ['entities_in_doc'];
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
 * Schema for search_knowledge tool
 */
export const SearchKnowledgeSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)'),
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(20, 'Limit cannot exceed 20')
    .optional()
    .default(5),
  published_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  published_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  include_undated: z.boolean().optional().default(false)
});

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
  search_knowledge: SearchKnowledgeSchema,
  hybrid_search: HybridSearchSchema,
  search_github_docs: SearchGithubDocsSchema,
  get_repo_overview: GetRepoOverviewSchema,
  get_tech_stack: GetTechStackSchema,
  get_stats: GetStatsSchema,
  generate_weekly_digest: GenerateWeeklyDigestSchema
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
  SearchKnowledgeSchema,
  HybridSearchSchema,
  SearchGithubDocsSchema,
  GetRepoOverviewSchema,
  GetTechStackSchema,
  GetStatsSchema,
  GenerateWeeklyDigestSchema
};
