/**
 * Graph Tool - MCP Tool for Querying Regen Code Knowledge Graph
 *
 * Provides an MCP tool interface for querying the Apache AGE graph database
 * containing Regen Network code entities and relationships.
 *
 * Supports two modes:
 * 1. API mode: When KOI_API_ENDPOINT is set, uses HTTP API at /api/koi/graph
 * 2. Direct mode: Connects directly to PostgreSQL (only works on server)
 *
 * Production Features (Phase 7):
 * - Structured logging with pino
 * - Metrics collection for performance monitoring
 * - Retry logic with exponential backoff
 * - Circuit breaker for preventing cascading failures
 * - LRU caching for query results
 * - Input validation with zod schemas
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import open from 'open';
import { logger, logQuery } from './logger.js';
import { recordQuery, recordApiCall } from './metrics.js';
import { withRetry, withTimeout, circuitBreakers, CircuitBreakerError, TimeoutError } from './resilience.js';
import { cachedQuery, shouldCache } from './cache.js';
import { validateToolInput, detectInjection, sanitizeString } from './validation.js';
// Shared auth module
import { USER_EMAIL, getAccessToken, setAccessToken } from './auth.js';
import {
  GraphClient,
  createGraphClient,
  KeeperForMsgResult,
  MsgForKeeperResult,
  DocMentioningResult,
  EntityInDocResult,
  RelatedEntity,
  Module,
  ModuleSearchResult,
  ModuleEntity,
} from './graph_client.js';

function unwrapKoiEnvelope<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    'request_id' in payload
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// Check if we should use API mode
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';
const USE_GRAPH_API = !!KOI_API_ENDPOINT;

// Tool definition following the pattern from tools.ts
export const GRAPH_TOOL: Tool = {
  name: 'query_code_graph',
  description: 'Query the Regen code knowledge graph to find code entities (Classes, Functions, Sensors, Handlers, Interfaces) and their relationships across repositories',
  inputSchema: {
    type: 'object',
    properties: {
      query_type: {
        type: 'string',
        enum: [
          'keeper_for_msg', 'msgs_for_keeper', 'docs_mentioning', 'entities_in_doc',
          'related_entities', 'find_by_type', 'search_entities', 'list_repos',
          // Discovery queries
          'list_entity_types', 'get_entity_stats',
          // RAPTOR module queries
          'list_modules', 'get_module', 'search_modules', 'module_entities', 'module_for_entity'
        ],
        description: 'Type of graph query: find_by_type (get all Sensors, Handlers, etc.), search_entities (search by name), list_repos (show indexed repositories), list_entity_types (show all entity types with counts), get_entity_stats (comprehensive graph statistics), list_modules (show all modules), search_modules (search modules by keyword)'
      },
      entity_name: {
        type: 'string',
        description: 'Name or search term (e.g., "MsgCreateBatch", "Sensor", "Twitter")'
      },
      entity_type: {
        type: 'string',
        description: 'Entity type for find_by_type query (e.g., "Sensor", "Handler", "Class", "Interface", "Function")'
      },
      doc_path: {
        type: 'string',
        description: 'Document path for doc-related queries'
      },
      repo_name: {
        type: 'string',
        description: 'Repository name to filter by (e.g., "koi-sensors", "GAIA")'
      },
      module_name: {
        type: 'string',
        description: 'Module name for module-related queries (e.g., "ecocredit", "cli", "sensors")'
      }
    },
    required: ['query_type']
  }
};

/**
 * Hit interface for structured results with provenance
 */
interface Hit {
  rid?: string;
  score?: number;
  entity_type?: string;
  entity_name?: string;
  file_path?: string;
  line_number?: number;
  content_preview?: string;
  edges?: Array<{ type: string; target: string }>;
  // Provenance metadata
  provenance?: {
    entity_rid?: string;
    cat_receipt_id?: string;
    commit_sha?: string;
    commit_date?: string;
    github_url?: string;
    extracted_at?: string;
    processor_version?: string;
    extraction_method?: string;
  };
}

function dedupeResults<T>(items: T[], getKey: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Configuration for timeouts
const API_TIMEOUT_MS = parseInt(process.env.GRAPH_API_TIMEOUT || '30000');
const API_MAX_RETRIES = parseInt(process.env.GRAPH_API_MAX_RETRIES || '3');

async function handleAuthFlow(authUrl: string, pollUrl: string): Promise<void> {
  console.error(`\n=== AUTHENTICATION REQUIRED ===`);
  console.error(`Opening browser to: ${authUrl}`);
  console.error(`Please log in with ${USER_EMAIL} to continue...`);
  
  await open(authUrl);

  // Poll for status
  const fullPollUrl = pollUrl.startsWith('http') ? pollUrl : `${KOI_API_ENDPOINT}${pollUrl}`;
  
  process.stdout.write('Waiting for authentication...');
  
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        process.stdout.write('.');
        const response = await axios.get(fullPollUrl);
        if ((response.data as { authenticated: boolean }).authenticated) {
          clearInterval(interval);
          console.error('\nAuthentication successful! Resuming query...');
          resolve();
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 2000);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Authentication timed out'));
    }, 120000);
  });
}

/**
 * Execute graph query via HTTP API with retry, timeout, and circuit breaker
 */
async function executeViaApi(args: any): Promise<any> {
  const graphApiUrl = `${KOI_API_ENDPOINT}/graph`;
  const startTime = Date.now();

  // Build headers with access token if available
  const buildHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Email': USER_EMAIL, // Kept for logging only
    };
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Use circuit breaker to prevent cascading failures
  return circuitBreakers.graphApi.execute(async () => {
    return withRetry(
      async () => {
        return withTimeout(
          async () => {
            try {
              const response = await axios.post(graphApiUrl, args, {
                headers: buildHeaders(),
                timeout: API_TIMEOUT_MS,
              });

              const duration = Date.now() - startTime;
              recordApiCall(duration, true);
              logger.debug({
                action: 'api_request',
                url: graphApiUrl,
                query_type: args.query_type,
                duration_ms: duration
              }, `Graph API request completed`);

              return unwrapKoiEnvelope(response.data);
            } catch (error: any) {
              // Check for Auth Required
              if (error.response && error.response.status === 401 && error.response.data.auth_url) {
                logger.info('Authentication required, initiating flow...');
                await handleAuthFlow(error.response.data.auth_url, error.response.data.poll_url);

                // Retry the request immediately after auth success
                const response = await axios.post(graphApiUrl, args, {
                  headers: buildHeaders(),
                  timeout: API_TIMEOUT_MS,
                });
                return unwrapKoiEnvelope(response.data);
              }
              throw error;
            }
          },
          API_TIMEOUT_MS,
          'Graph API request'
        );
      },
      {
        maxRetries: API_MAX_RETRIES,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        onRetry: (error, attempt, delay) => {
          logger.warn({
            action: 'api_retry',
            url: graphApiUrl,
            attempt,
            delay_ms: delay,
            error: error.message
          }, `Retrying Graph API request`);
        }
      }
    );
  }).catch((error: any) => {
    const duration = Date.now() - startTime;
    recordApiCall(duration, false);

    // Handle specific error types with user-friendly messages
    if (error instanceof CircuitBreakerError) {
      logger.error({
        action: 'circuit_breaker_open',
        service: 'graph-api',
        retry_after: error.retryAfter?.toISOString()
      }, 'Graph API circuit breaker is open');
      throw new Error('Graph database is temporarily unavailable. Please try again in a minute.');
    }

    if (error instanceof TimeoutError) {
      logger.error({
        action: 'api_timeout',
        url: graphApiUrl,
        timeout_ms: API_TIMEOUT_MS
      }, 'Graph API request timed out');
      throw new Error(`Query timed out after ${API_TIMEOUT_MS / 1000}s. Try a more specific query or reduce the scope.`);
    }

    if (error.response) {
      logger.error({
        action: 'api_error',
        url: graphApiUrl,
        status: error.response.status,
        data: error.response.data
      }, `Graph API returned error`);
      throw new Error(`Graph API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }

    if (error.code === 'ECONNREFUSED') {
      logger.error({
        action: 'api_connection_refused',
        url: graphApiUrl
      }, 'Cannot connect to Graph API');
      throw new Error('Cannot connect to graph database. Please check if the service is running.');
    }

    logger.error({
      action: 'api_unknown_error',
      url: graphApiUrl,
      error: error.message
    }, 'Unknown error during Graph API request');
    throw new Error(`Graph query failed: ${error.message}`);
  });
}


/**
 * Execute the query_code_graph tool with production hardening
 */
export async function executeGraphTool(args: any) {
  const startTime = Date.now();
  const { query_type, entity_name, doc_path } = args;

  // Step 1: Input validation
  const validation = validateToolInput('query_code_graph', args);
  if (!validation.success) {
    logger.warn({
      action: 'validation_failed',
      tool: 'query_code_graph',
      args,
      error: validation.error
    }, 'Input validation failed');
    return {
      content: [{
        type: 'text',
        text: `Validation Error: ${validation.error}`
      }]
    };
  }

  // Step 2: Check for potential injection attacks
  const stringParams = [entity_name, doc_path, args.entity_type, args.module_name].filter(Boolean);
  for (const param of stringParams) {
    if (detectInjection(param)) {
      logger.warn({
        action: 'injection_detected',
        tool: 'query_code_graph',
        param
      }, 'Potential injection attack detected');
      return {
        content: [{
          type: 'text',
          text: 'Invalid input: potentially unsafe characters detected'
        }]
      };
    }
  }

  // Validate required parameters
  if (!query_type) {
    return {
      content: [{
        type: 'text',
        text: 'Error: query_type is required'
      }]
    };
  }

  logger.info({
    action: 'tool_execute',
    tool: 'query_code_graph',
    query_type,
    entity_name: entity_name || doc_path
  }, `Executing query_code_graph: ${query_type}`);

  // Use API mode if KOI_API_ENDPOINT is set
  if (USE_GRAPH_API) {
    try {
      // Step 3: Check cache first
      let apiResult: any;
      let cached = false;

      if (shouldCache(query_type)) {
        apiResult = await cachedQuery(
          'query_code_graph',
          query_type,
          args,
          () => executeViaApi(args)
        );
        // Check if this was a cache hit (result is identical reference)
        cached = true; // We'll track this more accurately in production
      } else {
        apiResult = await executeViaApi(args);
      }

      const duration_ms = Date.now() - startTime;

      // Format API results
      let results = apiResult.results || [];
      let total_results = results.length;

      let markdownSummary = '';
      let hits: Hit[] = [];

      // Format based on query type
      switch (query_type) {
        case 'list_repos':
          markdownSummary = `# Indexed Repositories\n\nFound **${total_results}** repositories:\n\n`;
          markdownSummary += '| Repository | Entity Count |\n|------------|-------------|\n';
          results.forEach((r: any) => {
            const repo = r.repo || r.result || r;
            const name = repo.name || 'unknown';
            // entity_count comes as a separate field at the top level
            const count = parseInt(r.entity_count) || repo.entity_count || 0;
            markdownSummary += `| ${name} | ${count.toLocaleString()} |\n`;
            hits.push({ entity_type: 'Repository', entity_name: name, content_preview: `${count} entities` });
          });
          break;

        case 'find_by_type':
          markdownSummary = `# Entities of Type: ${args.entity_type}\n\nFound **${total_results}** ${args.entity_type}(s):\n\n`;
          results.forEach((r: any, i: number) => {
            const entity = r.entity || r.result || r;
            markdownSummary += `## ${i + 1}. ${entity.name}\n`;
            markdownSummary += `- **File:** \`${entity.file_path || 'N/A'}\`\n`;
            if (entity.line_number) markdownSummary += `- **Line:** ${entity.line_number}\n`;
            if (entity.github_url) markdownSummary += `- **Source:** [GitHub](${entity.github_url})\n`;
            if (entity.commit_sha) markdownSummary += `- **Commit:** \`${entity.commit_sha.substring(0, 8)}\`\n`;
            markdownSummary += '\n';
            hits.push({
              entity_type: args.entity_type,
              entity_name: entity.name,
              file_path: entity.file_path,
              line_number: entity.line_number,
              provenance: entity.cat_receipt_id ? {
                entity_rid: entity.entity_rid,
                cat_receipt_id: entity.cat_receipt_id,
                commit_sha: entity.commit_sha,
                commit_date: entity.commit_date,
                github_url: entity.github_url,
                extracted_at: entity.extracted_at,
                processor_version: entity.processor_version,
                extraction_method: entity.extraction_method,
              } : undefined,
            });
          });
          break;

        case 'search_entities':
          results = dedupeResults(results, (r: any) => {
            const entity = r.entity || r.result || r;
            // Check multiple locations for entity_rid
            const entityRid = entity.entity_rid ||
              entity.provenance?.entity_rid ||
              r.provenance?.entity_rid ||
              r.entity_rid;
            // Fallback to composite key from identifying fields
            return entityRid || `${entity.repo || r.repo || ''}:${entity.file_path || r.file_path || ''}:${entity.line_number || r.line_number || ''}:${entity.name || entity.entity_name || r.entity_name || ''}`;
          });
          total_results = results.length;
          markdownSummary = `# Search Results: "${entity_name}"\n\nFound **${total_results}** matching entities:\n\n`;
          results.forEach((r: any, i: number) => {
            const entity = r.entity || r.result || r;
            const label = entity.label || 'Entity';
            markdownSummary += `## ${i + 1}. ${entity.name} (${label})\n`;
            markdownSummary += `- **Repository:** ${entity.repo || 'N/A'}\n`;
            markdownSummary += `- **File:** \`${entity.file_path || 'N/A'}\`\n`;
            if (entity.github_url) markdownSummary += `- **Source:** [GitHub](${entity.github_url})\n`;
            if (entity.commit_sha) markdownSummary += `- **Commit:** \`${entity.commit_sha.substring(0, 8)}\`\n`;
            markdownSummary += '\n';
            hits.push({
              entity_type: label,
              entity_name: entity.name,
              file_path: entity.file_path,
              provenance: entity.cat_receipt_id ? {
                entity_rid: entity.entity_rid,
                cat_receipt_id: entity.cat_receipt_id,
                commit_sha: entity.commit_sha,
                commit_date: entity.commit_date,
                github_url: entity.github_url,
                extracted_at: entity.extracted_at,
                processor_version: entity.processor_version,
                extraction_method: entity.extraction_method,
              } : undefined,
            });
          });
          break;

        case 'list_entity_types':
          markdownSummary = `# Entity Types in Graph\n\nFound **${total_results}** entity types:\n\n`;
          markdownSummary += '| Entity Type | Count |\n|-------------|-------|\n';
          let totalEntities = 0;
          results.forEach((r: any) => {
            const type = r.entity_type || 'Unknown';
            const count = parseInt(r.count) || 0;
            totalEntities += count;
            markdownSummary += `| ${type} | ${count.toLocaleString()} |\n`;
            hits.push({ entity_type: 'EntityType', entity_name: type, content_preview: `${count} entities` });
          });
          markdownSummary += `| **TOTAL** | **${totalEntities.toLocaleString()}** |\n`;
          break;

        case 'get_entity_stats':
          markdownSummary = `# Graph Statistics\n\n`;
          let statsTotal = 0;
          results.forEach((r: any) => {
            statsTotal += parseInt(r.count) || 0;
          });
          markdownSummary += `**Total Entities:** ${statsTotal.toLocaleString()}\n\n`;
          markdownSummary += '## Entities by Type\n\n';
          markdownSummary += '| Type | Count | Languages | Repositories |\n|------|-------|-----------|-------------|\n';
          results.forEach((r: any) => {
            const type = r.entity_type || 'Unknown';
            const count = parseInt(r.count) || 0;
            const langs = Array.isArray(r.languages) ? r.languages.filter((l: any) => l).join(', ') : 'N/A';
            const repos = Array.isArray(r.repos) ? r.repos.filter((repo: any) => repo).join(', ') : 'N/A';
            markdownSummary += `| ${type} | ${count.toLocaleString()} | ${langs || 'N/A'} | ${repos || 'N/A'} |\n`;
            hits.push({
              entity_type: 'EntityStats',
              entity_name: type,
              content_preview: `${count} entities across ${repos}`
            });
          });
          break;

        default:
          // Generic formatting for other query types
          markdownSummary = `# ${query_type} Results\n\nFound **${total_results}** results:\n\n`;
          results.forEach((r: any, i: number) => {
            const entity = r.entity || r.keeper || r.message || r.module || r.result || r;
            markdownSummary += `${i + 1}. ${JSON.stringify(entity)}\n`;
            hits.push({ entity_name: entity.name || 'unknown', content_preview: JSON.stringify(entity).substring(0, 100) });
          });
      }

      const jsonData = JSON.stringify({ hits, metadata: { query_type, duration_ms, total_results, via: 'api' } }, null, 2);

      // Record successful query metrics
      recordQuery('query_code_graph', duration_ms, true);
      logQuery({
        tool: 'query_code_graph',
        query_type,
        duration_ms,
        result_count: total_results,
        cached
      });

      return {
        content: [{
          type: 'text',
          text: markdownSummary + '\n\n---\n\n<details>\n<summary>Raw JSON (for eval harness)</summary>\n\n```json\n' + jsonData + '\n```\n</details>'
        }]
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Record failed query metrics
      recordQuery('query_code_graph', duration_ms, false, errorMessage);
      logQuery({
        tool: 'query_code_graph',
        query_type,
        duration_ms,
        error: errorMessage
      });

      logger.error({
        action: 'tool_error',
        tool: 'query_code_graph',
        query_type,
        error: errorMessage
      }, `Graph tool error: ${errorMessage}`);

      return {
        content: [{
          type: 'text',
          text: `Error querying graph via API: ${errorMessage}`
        }]
      };
    }
  }

  // Fall back to direct PostgreSQL connection (only works on server)
  const client = createGraphClient();

  try {
    const startTime = Date.now();

    // Execute query based on type
    let markdownSummary = '';
    let hits: Hit[] = [];
    let total_results = 0;

    switch (query_type) {
      case 'keeper_for_msg':
        if (!entity_name) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name is required for keeper_for_msg query'
            }]
          };
        }
        const keeperResults = await client.getKeeperForMsg(entity_name);
        total_results = keeperResults.length;

        markdownSummary = formatKeeperForMsgResults(entity_name, keeperResults);
        hits = keeperResults.map(r => ({
          entity_type: 'Keeper',
          entity_name: r.keeper_name,
          file_path: r.keeper_file_path,
          line_number: r.keeper_line_number,
          content_preview: `${r.keeper_name} handles ${entity_name}`,
          edges: [{ type: 'HANDLES', target: entity_name }]
        }));
        break;

      case 'msgs_for_keeper':
        if (!entity_name) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name is required for msgs_for_keeper query'
            }]
          };
        }
        const msgResults = await client.getMsgsForKeeper(entity_name);
        total_results = msgResults.length;

        markdownSummary = formatMsgsForKeeperResults(entity_name, msgResults);
        hits = msgResults.map(r => ({
          entity_type: 'Msg',
          entity_name: r.msg_name,
          content_preview: r.msg_package ? `${r.msg_name} (${r.msg_package})` : r.msg_name,
          edges: [{ type: 'HANDLED_BY', target: entity_name }]
        }));
        break;

      case 'docs_mentioning':
        if (!entity_name) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name is required for docs_mentioning query'
            }]
          };
        }
        const docResults = await client.getDocsMentioning(entity_name);
        total_results = docResults.length;

        markdownSummary = formatDocsMentioningResults(entity_name, docResults);
        hits = docResults.map(r => ({
          entity_type: 'Document',
          entity_name: r.title,
          file_path: r.file_path,
          content_preview: `Document mentions ${entity_name}`,
          edges: [{ type: 'MENTIONS', target: entity_name }]
        }));
        break;

      case 'entities_in_doc':
        if (!doc_path) {
          return {
            content: [{
              type: 'text',
              text: 'Error: doc_path is required for entities_in_doc query'
            }]
          };
        }
        const entityResults = await client.getEntitiesInDoc(doc_path);
        total_results = entityResults.length;

        markdownSummary = formatEntitiesInDocResults(doc_path, entityResults);
        hits = entityResults.map(r => ({
          entity_type: r.type,
          entity_name: r.name,
          content_preview: `${r.type}: ${r.name}`,
          edges: [{ type: 'MENTIONED_IN', target: doc_path }]
        }));
        break;

      case 'related_entities':
        if (!entity_name) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name is required for related_entities query'
            }]
          };
        }
        const relatedResults = await client.getRelatedEntities(entity_name);
        total_results = relatedResults.length;

        markdownSummary = formatRelatedEntitiesResults(entity_name, relatedResults);
        hits = relatedResults.map(r => ({
          entity_type: r.type,
          entity_name: r.name,
          score: r.shared_docs ? r.shared_docs / 10 : 0.5, // Normalize score
          content_preview: `${r.type}: ${r.name} (${r.shared_docs || 0} shared docs)`,
          edges: [{ type: 'RELATED_VIA_DOCS', target: entity_name }]
        }));
        break;

      case 'find_by_type':
        const entityType = args.entity_type;
        if (!entityType) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_type is required for find_by_type query'
            }]
          };
        }
        const typeResults = await client.getEntitiesByType(entityType);
        total_results = typeResults.length;

        markdownSummary = `# Entities of Type: ${entityType}\n\nFound **${total_results}** ${entityType}(s):\n\n`;
        typeResults.forEach((r, i) => {
          markdownSummary += `## ${i + 1}. ${r.name}\n`;
          markdownSummary += `- **File:** \`${r.file_path || 'N/A'}\`\n`;
          if (r.line_number) markdownSummary += `- **Line:** ${r.line_number}\n`;
          markdownSummary += '\n';
        });

        hits = typeResults.map(r => ({
          entity_type: r.type,
          entity_name: r.name,
          file_path: r.file_path,
          line_number: r.line_number,
          content_preview: r.docstring || `${r.type}: ${r.name}`
        }));
        break;

      case 'search_entities':
        const searchTerm = entity_name;
        if (!searchTerm) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name (search term) is required for search_entities query'
            }]
          };
        }
        const searchResults = await client.findEntitiesByName(searchTerm);
        total_results = searchResults.length;

        markdownSummary = `# Search Results: "${searchTerm}"\n\nFound **${total_results}** matching entities:\n\n`;
        searchResults.forEach((r: any, i: number) => {
          markdownSummary += `## ${i + 1}. ${r.name} (${r.type})\n`;
          markdownSummary += `- **Repository:** ${r.repo || 'N/A'}\n`;
          markdownSummary += `- **File:** \`${r.file_path || 'N/A'}\`\n`;
          if (r.line_number) markdownSummary += `- **Line:** ${r.line_number}\n`;
          markdownSummary += '\n';
        });

        hits = searchResults.map((r: any) => ({
          entity_type: r.type,
          entity_name: r.name,
          file_path: r.file_path,
          line_number: r.line_number,
          content_preview: r.docstring || `${r.type}: ${r.name}`
        }));
        break;

      case 'list_repos':
        const repoResults = await client.getRepositories();
        total_results = repoResults.length;

        markdownSummary = `# Indexed Repositories\n\nFound **${total_results}** repositories:\n\n`;
        markdownSummary += '| Repository | Entity Count |\n|------------|-------------|\n';
        repoResults.forEach(r => {
          markdownSummary += `| ${r.name} | ${r.entity_count} |\n`;
        });

        hits = repoResults.map(r => ({
          entity_type: 'Repository',
          entity_name: r.name,
          content_preview: `${r.entity_count} entities`
        }));
        break;

      // ============= RAPTOR Module Queries =============

      case 'list_modules':
        const moduleResults = await client.getAllModules();
        total_results = moduleResults.length;

        markdownSummary = `# All Modules (RAPTOR)\n\nFound **${total_results}** modules:\n\n`;
        markdownSummary += '| Module | Repository | Path | Entities |\n|--------|------------|------|----------|\n';
        moduleResults.forEach(m => {
          markdownSummary += `| ${m.name} | ${m.repo} | ${m.path} | ${m.entity_count} |\n`;
        });

        hits = moduleResults.map(m => ({
          entity_type: 'Module',
          entity_name: m.name,
          file_path: m.path,
          content_preview: m.summary ? m.summary.substring(0, 200) + '...' : `${m.entity_count} entities in ${m.repo}`
        }));
        break;

      case 'get_module':
        const moduleName = args.module_name;
        const repoFilter = args.repo_name;
        if (!moduleName) {
          return {
            content: [{
              type: 'text',
              text: 'Error: module_name is required for get_module query'
            }]
          };
        }
        const moduleResult = await client.getModule(moduleName, repoFilter);
        if (!moduleResult) {
          markdownSummary = `# Module Not Found: ${moduleName}\n\nNo module named **${moduleName}** was found.\n`;
          total_results = 0;
        } else {
          total_results = 1;
          markdownSummary = `# Module: ${moduleResult.name}\n\n`;
          markdownSummary += `- **Repository:** ${moduleResult.repo}\n`;
          markdownSummary += `- **Path:** \`${moduleResult.path}\`\n`;
          markdownSummary += `- **Entity Count:** ${moduleResult.entity_count}\n\n`;
          if (moduleResult.summary) {
            markdownSummary += `## Summary\n\n${moduleResult.summary}\n`;
          }

          hits = [{
            entity_type: 'Module',
            entity_name: moduleResult.name,
            file_path: moduleResult.path,
            content_preview: moduleResult.summary || `${moduleResult.entity_count} entities`
          }];
        }
        break;

      case 'search_modules':
        const searchPattern = entity_name;
        if (!searchPattern) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name (search pattern) is required for search_modules query'
            }]
          };
        }
        const moduleSearchResults = await client.searchModules(searchPattern);
        total_results = moduleSearchResults.length;

        markdownSummary = `# Module Search: "${searchPattern}"\n\nFound **${total_results}** matching modules:\n\n`;
        moduleSearchResults.forEach((m, i) => {
          markdownSummary += `## ${i + 1}. ${m.name} (${m.repo})\n`;
          markdownSummary += `- **Path:** \`${m.path}\`\n`;
          markdownSummary += `- **Entities:** ${m.entity_count}\n`;
          if (m.summary) {
            markdownSummary += `\n${m.summary.substring(0, 300)}...\n`;
          }
          markdownSummary += '\n';
        });

        hits = moduleSearchResults.map(m => ({
          entity_type: 'Module',
          entity_name: m.name,
          file_path: m.path,
          content_preview: m.summary || `${m.entity_count} entities in ${m.repo}`
        }));
        break;

      case 'module_entities':
        const targetModule = args.module_name;
        const targetRepo = args.repo_name;
        if (!targetModule) {
          return {
            content: [{
              type: 'text',
              text: 'Error: module_name is required for module_entities query'
            }]
          };
        }
        const moduleEntities = await client.getModuleEntities(targetModule, targetRepo);
        total_results = moduleEntities.length;

        markdownSummary = `# Entities in Module: ${targetModule}\n\nFound **${total_results}** entities:\n\n`;

        // Group by type
        const byType: Record<string, ModuleEntity[]> = {};
        moduleEntities.forEach(e => {
          if (!byType[e.type]) byType[e.type] = [];
          byType[e.type].push(e);
        });

        Object.keys(byType).forEach(type => {
          markdownSummary += `## ${type}s (${byType[type].length})\n\n`;
          byType[type].forEach(e => {
            markdownSummary += `- **${e.name}**`;
            if (e.file_path) markdownSummary += ` (\`${e.file_path}\`)`;
            markdownSummary += '\n';
          });
          markdownSummary += '\n';
        });

        hits = moduleEntities.map(e => ({
          entity_type: e.type,
          entity_name: e.name,
          file_path: e.file_path,
          line_number: e.line_number
        }));
        break;

      case 'module_for_entity':
        const entityToFind = entity_name;
        if (!entityToFind) {
          return {
            content: [{
              type: 'text',
              text: 'Error: entity_name is required for module_for_entity query'
            }]
          };
        }
        const containingModule = await client.getModuleForEntity(entityToFind);
        if (!containingModule) {
          markdownSummary = `# Module for Entity: ${entityToFind}\n\nNo module found containing **${entityToFind}**.\n`;
          total_results = 0;
          hits = [];
        } else {
          total_results = 1;
          markdownSummary = `# Module for Entity: ${entityToFind}\n\n`;
          markdownSummary += `**${entityToFind}** is part of the **${containingModule.name}** module.\n\n`;
          markdownSummary += `- **Repository:** ${containingModule.repo}\n`;
          markdownSummary += `- **Path:** \`${containingModule.path}\`\n`;
          markdownSummary += `- **Entity Count:** ${containingModule.entity_count}\n\n`;
          if (containingModule.summary) {
            markdownSummary += `## Module Summary\n\n${containingModule.summary}\n`;
          }

          hits = [{
            entity_type: 'Module',
            entity_name: containingModule.name,
            file_path: containingModule.path,
            content_preview: containingModule.summary || `Contains ${entityToFind}`
          }];
        }
        break;

      default:
        return {
          content: [{
            type: 'text',
            text: `Error: Unknown query_type: ${query_type}`
          }]
        };
    }

    const duration_ms = Date.now() - startTime;

    // Record successful query metrics
    recordQuery('query_code_graph', duration_ms, true);
    logQuery({
      tool: 'query_code_graph',
      query_type,
      duration_ms,
      result_count: total_results,
      via: 'direct'
    });

    // Return response - MCP only supports type: 'text'
    // Include JSON as a code block in the markdown for eval harness
    const jsonData = JSON.stringify({
      hits,
      metadata: {
        query_type,
        entity_name: entity_name || doc_path,
        duration_ms,
        total_results
      }
    }, null, 2);

    return {
      content: [
        {
          type: 'text',
          text: markdownSummary + '\n\n---\n\n<details>\n<summary>Raw JSON (for eval harness)</summary>\n\n```json\n' + jsonData + '\n```\n</details>'
        }
      ]
    };

  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Record failed query metrics
    recordQuery('query_code_graph', duration_ms, false, errorMessage);
    logQuery({
      tool: 'query_code_graph',
      query_type,
      duration_ms,
      error: errorMessage,
      via: 'direct'
    });

    logger.error({
      action: 'tool_error',
      tool: 'query_code_graph',
      query_type,
      error: errorMessage
    }, `Graph tool error (direct): ${errorMessage}`);

    return {
      content: [{
        type: 'text',
        text: `Error querying graph: ${errorMessage}`
      }]
    };
  } finally {
    await client.close();
  }
}

/**
 * Format keeper_for_msg results as markdown
 */
function formatKeeperForMsgResults(msgName: string, results: KeeperForMsgResult[]): string {
  if (results.length === 0) {
    return `# Keeper for Message: ${msgName}\n\nNo Keeper found that handles **${msgName}**.\n\n` +
           `This could mean:\n` +
           `- The message hasn't been indexed yet\n` +
           `- The HANDLES relationship hasn't been created\n` +
           `- The message name is incorrect\n`;
  }

  let markdown = `# Keeper for Message: ${msgName}\n\n`;
  markdown += `Found **${results.length}** Keeper(s) that handle **${msgName}**:\n\n`;

  results.forEach((result, index) => {
    markdown += `## ${index + 1}. ${result.keeper_name}\n\n`;
    markdown += `- **File:** \`${result.keeper_file_path}\`\n`;
    markdown += `- **Line:** ${result.keeper_line_number}\n`;
    markdown += `- **Relationship:** HANDLES → ${msgName}\n\n`;
  });

  return markdown;
}

/**
 * Format msgs_for_keeper results as markdown
 */
function formatMsgsForKeeperResults(keeperName: string, results: MsgForKeeperResult[]): string {
  if (results.length === 0) {
    return `# Messages Handled by: ${keeperName}\n\n**${keeperName}** doesn't handle any messages (or hasn't been indexed yet).\n`;
  }

  let markdown = `# Messages Handled by: ${keeperName}\n\n`;
  markdown += `**${keeperName}** handles **${results.length}** message(s):\n\n`;

  results.forEach((result, index) => {
    markdown += `${index + 1}. **${result.msg_name}**`;
    if (result.msg_package) {
      markdown += ` (package: ${result.msg_package})`;
    }
    markdown += `\n`;
  });

  markdown += `\n`;
  return markdown;
}

/**
 * Format docs_mentioning results as markdown
 */
function formatDocsMentioningResults(entityName: string, results: DocMentioningResult[]): string {
  if (results.length === 0) {
    return `# Documents Mentioning: ${entityName}\n\nNo documents found that mention **${entityName}**.\n\n` +
           `This could mean:\n` +
           `- Documents haven't been indexed yet\n` +
           `- MENTIONS relationships haven't been created\n` +
           `- The entity name is incorrect\n`;
  }

  let markdown = `# Documents Mentioning: ${entityName}\n\n`;
  markdown += `Found **${results.length}** document(s) that mention **${entityName}**:\n\n`;

  results.forEach((result, index) => {
    markdown += `${index + 1}. **${result.title}**\n`;
    markdown += `   - Path: \`${result.file_path}\`\n\n`;
  });

  return markdown;
}

/**
 * Format entities_in_doc results as markdown
 */
function formatEntitiesInDocResults(docPath: string, results: EntityInDocResult[]): string {
  if (results.length === 0) {
    return `# Entities in Document: ${docPath}\n\nNo entities found in this document.\n`;
  }

  let markdown = `# Entities in Document\n\n`;
  markdown += `**Path:** \`${docPath}\`\n\n`;
  markdown += `Found **${results.length}** entities mentioned in this document:\n\n`;

  // Group by type
  const byType: Record<string, string[]> = {};
  results.forEach(result => {
    if (!byType[result.type]) {
      byType[result.type] = [];
    }
    byType[result.type].push(result.name);
  });

  Object.keys(byType).forEach(type => {
    markdown += `## ${type}s (${byType[type].length})\n\n`;
    byType[type].forEach(name => {
      markdown += `- ${name}\n`;
    });
    markdown += `\n`;
  });

  return markdown;
}

/**
 * Format related_entities results as markdown
 */
function formatRelatedEntitiesResults(entityName: string, results: RelatedEntity[]): string {
  if (results.length === 0) {
    return `# Related Entities: ${entityName}\n\nNo related entities found for **${entityName}**.\n`;
  }

  let markdown = `# Related Entities: ${entityName}\n\n`;
  markdown += `Found **${results.length}** entities related to **${entityName}** (via shared documentation):\n\n`;

  results.forEach((result, index) => {
    markdown += `${index + 1}. **${result.name}** (${result.type})`;
    if (result.shared_docs) {
      markdown += ` - ${result.shared_docs} shared document(s)`;
    }
    markdown += `\n`;
  });

  markdown += `\n`;
  return markdown;
}

/**
 * Export for easy integration into MCP server
 */
export default {
  tool: GRAPH_TOOL,
  execute: executeGraphTool,
};
