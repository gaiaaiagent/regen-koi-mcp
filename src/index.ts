#!/usr/bin/env node
/**
 * Regen KOI MCP Server
 * Provides access to Regen Network's Knowledge Organization Infrastructure
 * via the Model Context Protocol for AI agents like Claude
 *
 * Production Features (Phase 7):
 * - Structured logging with pino
 * - Metrics collection for performance monitoring
 * - Input validation with zod schemas
 * - Comprehensive error handling
 * - Health check endpoint
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';
import { TOOLS } from './tools.js';
// Use enhanced SPARQL client with focused retrieval
import { SPARQLClient } from './sparql-client-enhanced.js';
import HybridSearchClient from './hybrid-client.js';
import { QueryRouter } from './query_router.js';
import { UnifiedSearch } from './unified_search.js';
import { executeGraphTool } from './graph_tool.js';
// Production hardening modules
import { logger } from './logger.js';
import { recordQuery, getMetricsMarkdown, getMetricsSummary } from './metrics.js';
import { validateToolInput } from './validation.js';
import { queryCache } from './cache.js';
// Shared auth module
import { USER_EMAIL, getAccessToken, setAccessToken, clearAuthCache } from './auth.js';

// Load environment variables
dotenv.config();

// Configuration
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';
const KOI_API_KEY = process.env.KOI_API_KEY || '';
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'regen-koi';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

console.error(`[${SERVER_NAME}] User email for auth: ${USER_EMAIL}`);

// Check if user is authenticated (with caching)
async function isUserAuthenticated(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;

  // Validate token with server
  try {
    const response = await axios.get<{ authenticated: boolean }>(`${KOI_API_ENDPOINT}/auth/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 5000
    });
    return response.data.authenticated || false;
  } catch (error) {
    return false;
  }
}

// API client configuration
// SECURITY: Authorization header is set dynamically based on access token
const apiClient = axios.create({
  baseURL: KOI_API_ENDPOINT,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-User-Email': USER_EMAIL, // Kept for logging purposes only, not for auth
  }
});

// Add request interceptor to dynamically include access token
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Tool definitions are imported from tools.ts

class KOIServer {
  private server: Server;
  private sparqlClient: SPARQLClient;
  private hybridClient: HybridSearchClient;
  private queryRouter: QueryRouter | null = null;
  private unifiedSearch: UnifiedSearch | null = null;

  constructor() {
    this.sparqlClient = new SPARQLClient();
    this.hybridClient = new HybridSearchClient();

    // Initialize QueryRouter and UnifiedSearch if database config is available
    try {
      if (process.env.GRAPH_DB_HOST && process.env.GRAPH_DB_NAME) {
        this.queryRouter = new QueryRouter({
          host: process.env.GRAPH_DB_HOST,
          port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
          database: process.env.GRAPH_DB_NAME,
          user: process.env.GRAPH_DB_USER,
          password: process.env.GRAPH_DB_PASSWORD,
          entitySimilarityThreshold: parseFloat(process.env.ENTITY_SIMILARITY_THRESHOLD || '0.15'),
        });

        this.unifiedSearch = new UnifiedSearch({
          host: process.env.GRAPH_DB_HOST,
          port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
          database: process.env.GRAPH_DB_NAME,
          user: process.env.GRAPH_DB_USER,
          password: process.env.GRAPH_DB_PASSWORD,
          graphName: process.env.GRAPH_NAME || 'regen_graph',
          embeddingDimension: parseInt(process.env.EMBEDDING_DIM || '1536') as any,
          rrfConstant: parseInt(process.env.RRF_K || '60'),
        });

        console.error(`[${SERVER_NAME}] Initialized QueryRouter and UnifiedSearch`);
      } else {
        console.error(`[${SERVER_NAME}] Graph database configuration not found - hybrid_search and query_code_graph tools will be unavailable`);
      }
    } catch (error) {
      console.error(`[${SERVER_NAME}] Failed to initialize graph components:`, error);
    }
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.logStartup();
  }

  private logStartup() {
    logger.info({
      action: 'server_start',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      api_endpoint: KOI_API_ENDPOINT,
      api_key_configured: !!KOI_API_KEY,
      graph_db_configured: !!(process.env.GRAPH_DB_HOST && process.env.GRAPH_DB_NAME)
    }, `Starting Regen KOI MCP Server v${SERVER_VERSION}`);
  }

  private setupHandlers() {
    // Handle tool list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();

      logger.info({
        action: 'tool_execute_start',
        tool: name,
        args_keys: Object.keys(args || {})
      }, `Executing tool: ${name}`);

      try {
        // Input validation for applicable tools
        const validationRequired = ['search_knowledge', 'hybrid_search', 'search_github_docs', 'get_repo_overview', 'get_tech_stack', 'generate_weekly_digest'];
        if (validationRequired.includes(name)) {
          const validation = validateToolInput(name, args);
          if (!validation.success) {
            logger.warn({
              action: 'validation_failed',
              tool: name,
              error: validation.error
            }, `Validation failed for ${name}`);

            recordQuery(name, Date.now() - startTime, false, validation.error);
            return {
              content: [{
                type: 'text',
                text: `Validation Error: ${validation.error}`
              }]
            };
          }
        }

        let result: any;
        switch (name) {
          case 'query_code_graph':
            result = await executeGraphTool(args);
            break;
          case 'hybrid_search':
            result = await this.handleHybridSearch(args);
            break;
          case 'search_knowledge':
            result = await this.searchKnowledge(args);
            break;
          case 'get_stats':
            result = await this.getStats(args);
            break;
          case 'get_mcp_metrics':
            result = await this.getMcpMetrics();
            break;
          case 'generate_weekly_digest':
            result = await this.generateWeeklyDigest(args);
            break;
          case 'get_notebooklm_export':
            result = await this.getNotebookLMExport(args);
            break;
          case 'search_github_docs':
            result = await this.searchGithubDocs(args);
            break;
          case 'get_repo_overview':
            result = await this.getRepoOverview(args);
            break;
          case 'get_tech_stack':
            result = await this.getTechStack(args);
            break;
          case 'regen_koi_authenticate':
            result = await this.authenticateUser();
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        const duration = Date.now() - startTime;
        recordQuery(name, duration, true);
        logger.info({
          action: 'tool_execute_success',
          tool: name,
          duration_ms: duration
        }, `Tool ${name} completed in ${duration}ms`);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        recordQuery(name, duration, false, errorMessage);
        logger.error({
          action: 'tool_execute_error',
          tool: name,
          duration_ms: duration,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        }, `Tool ${name} failed: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private parseRecencyFromQuery(query: string): { start?: string, end?: string } | null {
    const q = (query || '').toLowerCase();
    const now = new Date();

    const fmt = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const minusDays = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d;
    };

    // Common recency phrases
    if (q.includes('past week') || q.includes('last week') || q.includes('last 7 days') || q.includes('past 7 days')) {
      return { start: fmt(minusDays(7)), end: fmt(now) };
    }
    if (q.includes('past month') || q.includes('last month') || q.includes('last 30 days') || q.includes('past 30 days')) {
      return { start: fmt(minusDays(30)), end: fmt(now) };
    }
    if (q.includes('past year') || q.includes('last year') || q.includes('last 365 days') || q.includes('past 365 days')) {
      return { start: fmt(minusDays(365)), end: fmt(now) };
    }
    // last N days
    const m = q.match(/last\s+(\d{1,3})\s+days?/);
    if (m) {
      const n = Math.min(365, Math.max(1, parseInt(m[1], 10)));
      return { start: fmt(minusDays(n)), end: fmt(now) };
    }
    // since YYYY-MM-DD (or YYYY/MM/DD)
    const m2 = q.match(/since\s+(\d{4}[-\/]\d{2}[-\/]\d{2})/);
    if (m2) {
      const dstr = m2[1].replace(/\//g, '-');
      return { start: dstr };
    }
    if (q.includes('today')) {
      const d = new Date(now);
      return { start: fmt(d), end: fmt(d) };
    }
    if (q.includes('yesterday')) {
      const d = minusDays(1);
      return { start: fmt(d), end: fmt(d) };
    }
    return null;
  }

  private async getSystemHealth() {
    const health: any = {
      jena: { ok: false },
      koi_api: { ok: false },
      embedding_service: { ok: false },
      consolidation: { ok: false },
      patterns: { ok: false }
    };

    // Jena probe
    try {
      const q = 'SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o } LIMIT 1';
      const res = await this.sparqlClient.executeQuery(q);
      const c = res?.results?.bindings?.[0]?.count?.value;
      health.jena = { ok: true, triples: c ? parseInt(c) : undefined };
    } catch (e) {
      health.jena = { ok: false };
    }

    // KOI API probe
    try {
      const resp = await apiClient.get('/health');
      health.koi_api = { ok: true, data: resp.data };
    } catch (e) {
      health.koi_api = { ok: false };
    }

    // Embedding service probe
    try {
      const url = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8095/health';
      const resp = await axios.get(url);
      health.embedding_service = { ok: true, data: resp.data };
    } catch (e) {
      health.embedding_service = { ok: false };
    }

    // Consolidation/patterns in memory
    try {
      // The enhanced client logs counts on load; here we check env presence
      health.consolidation = { ok: !!process.env.CONSOLIDATION_PATH, path: process.env.CONSOLIDATION_PATH };
      health.patterns = { ok: !!process.env.PATTERNS_PATH, path: process.env.PATTERNS_PATH };
    } catch {}

    const text = `# System Health\n\n` +
      `- Jena: ${health.jena.ok ? 'OK' : 'DOWN'}${health.jena.triples ? ` (triples: ${health.jena.triples})` : ''}\n` +
      `- KOI API: ${health.koi_api.ok ? 'OK' : 'DOWN'}\n` +
      `- Embedding Service: ${health.embedding_service.ok ? 'OK' : 'DOWN'}\n` +
      `- Consolidation Path: ${health.consolidation.path || 'not set'}\n` +
      `- Patterns Path: ${health.patterns.path || 'not set'}\n`;

    return { content: [{ type: 'text', text }] };
  }

  private async getPredicateCommunitySummary(args: any) {
    const { community_id, limit = 10, search = '' } = args || {};
    const path = process.env.COMMUNITY_PATH || '/opt/projects/koi-processor/src/core/predicate_communities.json';
    try {
      const fs = await import('fs');
      if (!fs.existsSync(path)) {
        return { content: [{ type: 'text', text: `No predicate_communities.json found at ${path}` }] };
      }
      const data = JSON.parse(fs.readFileSync(path, 'utf-8')) as any;
      const communities = data.communities || [];

      if (typeof community_id === 'number') {
        const selected = communities.find((c: any) => c.id === community_id);
        if (!selected) return { content: [{ type: 'text', text: `Community ${community_id} not found` }] };
        const top = (selected.top_members || selected.members || []).slice(0, limit);
        let text = `# Predicate Community ${community_id}\n\n`;
        text += `- Size: ${selected.size}\n`;
        text += `- Top members:\n`;
        for (const m of top) text += `  - ${m}\n`;
        return { content: [{ type: 'text', text }] };
      }

      let selected = communities as any[];
      if (search) {
        const s = search.toLowerCase();
        selected = selected.filter(c => (c.members || []).some((m: string) => m.toLowerCase().includes(s)));
      }
      selected = selected.slice(0, limit);
      let text = `# Predicate Communities (top ${selected.length})\n\n`;
      for (const c of selected) {
        const top = (c.top_members || c.members || []).slice(0, 8);
        text += `- Community ${c.id}: size ${c.size}, examples: ${top.join(', ')}\n`;
      }
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error reading communities: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }

  private async getCanonicalSummary(args: any) {
    const { category, limit = 10 } = args || {};
    const prefix = 'PREFIX regx: <https://regen.network/ontology/experimental#>\n';
    try {
      if (category && typeof category === 'string') {
        const cat = category.replace(/"/g, '');
        const q = prefix + `SELECT ?predicate (COUNT(*) as ?count) WHERE {\n  ?stmt a regx:Statement .\n  ?stmt regx:canonicalPredicate "${cat}" .\n  ?stmt regx:predicate ?predicate .\n} GROUP BY ?predicate ORDER BY DESC(?count) LIMIT ${limit}`;
        const res = await this.sparqlClient.executeQuery(q);
        const rows = res?.results?.bindings || [];
        let text = `# Canonical Category: ${cat}\n\nTop predicates (limit ${limit}):\n`;
        for (const r of rows) {
          text += `- ${r.predicate.value} (${r.count.value})\n`;
        }
        return { content: [{ type: 'text', text }] };
      }
      // Summary across categories
      const q = prefix + `SELECT ?cat (COUNT(*) as ?count) WHERE {\n  ?stmt a regx:Statement .\n  ?stmt regx:canonicalPredicate ?cat .\n} GROUP BY ?cat ORDER BY DESC(?count)`;
      const res = await this.sparqlClient.executeQuery(q);
      const rows = res?.results?.bindings || [];
      let text = `# Canonical Categories\n\n`;
      for (const r of rows) {
        text += `- ${r.cat.value}: ${r.count.value}\n`;
      }
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }

  private async searchKnowledge(args: any) {
    const { query, limit = 5, published_from, published_to, include_undated = false, useHybrid = false } = args || {};
    const vectorFilters: any = {};

    // Respect explicit date filter
    if (published_from || published_to) {
      vectorFilters.date_range = {
        ...(published_from ? { start: published_from } : {}),
        ...(published_to ? { end: published_to } : {})
      };
    } else {
      // Try to infer recency from the natural language query
      const recency = this.parseRecencyFromQuery(query || '');
      if (recency) {
        vectorFilters.date_range = {
          ...(recency.start ? { start: recency.start } : {}),
          ...(recency.end ? { end: recency.end } : {})
        };
      }
    }

    if (include_undated) {
      vectorFilters.include_undated = true;
    }

    // Use true hybrid search if enabled
    if (useHybrid) {
      try {
        const results = await this.hybridClient.hybridSearch(query, {
          sparqlLimit: limit * 2,
          vectorLimit: limit,
          fusionStrategy: 'rrf',
          filters: vectorFilters
        });

        const formattedResults = this.hybridClient.formatResults(results);

        return {
          content: [
            {
              type: 'text',
              text: formattedResults,
            },
          ],
        };
      } catch (error) {
        console.error('Hybrid search failed, falling back to vector-only:', error);
      }
    }

    // Fallback to original vector search
    try {
      const body: any = { question: query, limit };
      if (Object.keys(vectorFilters).length > 0) body.filters = vectorFilters;
      const response = await apiClient.post('/query', body);

      const data = response.data as any;
      const results = data.results || [];
      const formattedResults = this.formatSearchResults(results, query);

      return {
        content: [
          {
            type: 'text',
            text: formattedResults,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to search knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getEntity(args: any) {
    const { identifier, include_related = true } = args;

    try {
      // Use query to search for entity information
      const response = await apiClient.post('/query', {
        query: `Information about ${identifier}`,
        limit: 10
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async queryGraph(args: any) {
    const { query, format = 'json' } = args;

    try {
      // Check if this looks like a SPARQL query
      const isSparql = query.trim().toLowerCase().startsWith('select') ||
                      query.trim().toLowerCase().startsWith('construct') ||
                      query.trim().toLowerCase().startsWith('ask') ||
                      query.trim().toLowerCase().startsWith('describe') ||
                      query.trim().toLowerCase().startsWith('prefix');

      let sparqlQuery: string;
      let isDirectSparql = false;

      if (isSparql) {
        // Direct SPARQL query
        sparqlQuery = query;
        isDirectSparql = true;
      } else {
        // Natural language query - adaptive dual-branch (focused + broad) with fusion
        console.error(`[${SERVER_NAME}] Adaptive NL→SPARQL: "${query}"`);
        const adaptive = await (this.sparqlClient as any).queryAdaptive(query, { limit: 50 });

        // Also fetch vector context
        let vectorResults = '';
        try {
          const response = await apiClient.post('/query', {
            query: query,
            limit: 5
          });
          const data: any = response.data as any;
          if (data?.results?.length > 0) {
            vectorResults = '\n\n## Related Documents (Vector Search)\n';
            data.results.forEach((result: any, index: number) => {
              vectorResults += `\n${index + 1}. **${result.title || 'Document'}** (Score: ${result.score?.toFixed(3)})\n`;
            });
          }
        } catch (e) {
          console.error(`[${SERVER_NAME}] Vector search failed (adaptive path)`, e);
        }

        return {
          content: [
            { type: 'text', text: adaptive.formatted + vectorResults }
          ]
        };
      }

      console.error(`[${SERVER_NAME}] Executing SPARQL query against Apache Jena`);

      // Execute the SPARQL query against Apache Jena
      const sparqlResults = await this.sparqlClient.executeQuery(sparqlQuery);

      // Format the results
      const formattedResults = this.sparqlClient.formatResults(sparqlResults, query);

      // Also try to get some relevant documents from the vector search for context
      let vectorResults = '';
      if (!isDirectSparql) {
        try {
          const response = await apiClient.post('/query', {
            query: query,
            limit: 5
          });

          const data: any = response.data as any;
          if (data?.results?.length > 0) {
            vectorResults = '\n\n## Related Documents (Vector Search)\n';
            data.results.forEach((result: any, index: number) => {
              vectorResults += `\n${index + 1}. **${result.title || 'Document'}** (Score: ${result.score?.toFixed(3)})\n`;
              if (result.content) {
                const preview = result.content.substring(0, 200);
                vectorResults += `   ${preview}...\n`;
              }
              if (result.rid) {
                vectorResults += `   RID: ${result.rid}\n`;
              }
            });
          }
        } catch (error) {
          console.error(`[${SERVER_NAME}] Vector search failed, continuing with SPARQL results only`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: formattedResults + vectorResults + (isDirectSparql ? `\n\n**SPARQL Query:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\`` : ''),
          },
        ],
      };
    } catch (error) {
      console.error(`[${SERVER_NAME}] Graph query error:`, error);

      // Fallback to vector search if SPARQL fails
      console.error(`[${SERVER_NAME}] Falling back to vector search`);
      try {
        const response = await apiClient.post('/query', {
          query: `entity graph information about "${query}" including relationships, roles, connections, and associated entities`,
          limit: 30
        });

        const data = response.data as any;
        if (data.results) {
          return {
            content: [
              {
                type: 'text',
                text: this.formatGraphResults(data.results, query, format) + '\n\n*Note: SPARQL query failed, showing vector search results instead*',
              },
            ],
          };
        }
      } catch (fallbackError) {
        // Both failed
      }

      throw new Error(`Failed to execute graph query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatGraphResults(results: any[], entityName: string, format: string): string {
    if (!results || results.length === 0) {
      return `No graph data found for entity: "${entityName}"`;
    }

    let formatted = `# Graph Query Results: "${entityName}"\n\n`;

    // Group results by confidence/relevance
    const highConfidence = results.filter(r => r.score > 0.4);
    const medConfidence = results.filter(r => r.score > 0.3 && r.score <= 0.4);

    if (highConfidence.length > 0) {
      formatted += `## Primary Entity Information\n\n`;
      for (const result of highConfidence) {
        if (result.content && result.content.toLowerCase().includes(entityName.toLowerCase())) {
          formatted += `### ${result.title || 'Entity Data'}\n`;
          formatted += `**Source**: ${result.source || 'Knowledge Graph'}\n`;
          formatted += `**Confidence**: ${(result.score * 100).toFixed(1)}%\n\n`;
          formatted += `${result.content}\n\n`;

          if (result.metadata) {
            formatted += `**Metadata**:\n\`\`\`json\n${JSON.stringify(result.metadata, null, 2)}\n\`\`\`\n\n`;
          }
          formatted += `---\n\n`;
        }
      }
    }

    if (medConfidence.length > 0) {
      formatted += `## Related Entities & Connections\n\n`;
      for (const result of medConfidence.slice(0, 5)) {
        formatted += `- **${result.title || 'Related'}** (${(result.score * 100).toFixed(1)}%): ${result.content.substring(0, 200)}...\n`;
      }
    }

    // Add graph structure summary if in graph format
    if (format === 'graph') {
      formatted += `\n## Graph Structure\n\n`;
      formatted += `\`\`\`\n`;
      formatted += `Entity: ${entityName}\n`;
      formatted += `├── Direct References: ${highConfidence.length}\n`;
      formatted += `└── Related Entities: ${medConfidence.length}\n`;
      formatted += `\`\`\`\n`;
    }

    return formatted;
  }

  private async getStats(args: any) {
    const { detailed = false } = args;

    try {
      const response = await apiClient.get('/stats');

      const stats = response.data as any;
      let formatted = `# KOI Knowledge Base Statistics\n\n`;

      // Main statistics
      formatted += `- **Total Documents**: ${stats.total_documents?.toLocaleString() || 'Unknown'}\n`;
      formatted += `- **Recent (7 days)**: ${stats.recent_7_days?.toLocaleString() || 'Unknown'}\n`;
      formatted += `- **API Endpoint**: ${KOI_API_ENDPOINT}\n\n`;

      // Source breakdown
      if (stats.by_source && Object.keys(stats.by_source).length > 0) {
        formatted += `## Documents by Source\n\n`;

        // Sort sources by count (descending)
        const sortedSources = Object.entries(stats.by_source)
          .sort(([, a], [, b]) => (b as number) - (a as number));

        for (const [source, count] of sortedSources) {
          formatted += `- **${source}**: ${(count as number).toLocaleString()}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get MCP Server metrics and health status
   * Provides performance metrics, cache stats, and system health
   */
  private async getMcpMetrics() {
    const metricsMarkdown = getMetricsMarkdown();
    const metricsSummary = getMetricsSummary();
    const cacheStats = queryCache.getStats();

    let output = metricsMarkdown;
    output += `\n## Cache Statistics\n\n`;
    output += `- **Total Cached Items:** ${cacheStats.totalSize}\n`;

    for (const [category, stats] of Object.entries(cacheStats.byCategory)) {
      output += `- **${category}:** ${stats.size}/${stats.maxSize} entries\n`;
    }

    output += `\n## System Health\n\n`;
    output += `- **Graph DB Configured:** ${!!(process.env.GRAPH_DB_HOST && process.env.GRAPH_DB_NAME)}\n`;
    output += `- **KOI API Endpoint:** ${KOI_API_ENDPOINT}\n`;
    output += `- **Query Router Available:** ${!!this.queryRouter}\n`;
    output += `- **Unified Search Available:** ${!!this.unifiedSearch}\n`;

    // Add raw JSON for programmatic access
    const jsonData = JSON.stringify({
      metrics: metricsSummary,
      cache: cacheStats,
      config: {
        api_endpoint: KOI_API_ENDPOINT,
        graph_db_configured: !!(process.env.GRAPH_DB_HOST && process.env.GRAPH_DB_NAME),
        query_router_available: !!this.queryRouter,
        unified_search_available: !!this.unifiedSearch
      }
    }, null, 2);

    return {
      content: [{
        type: 'text',
        text: output + '\n\n---\n\n<details>\n<summary>Raw JSON</summary>\n\n```json\n' + jsonData + '\n```\n</details>'
      }]
    };
  }

  private async listCreditClasses(args: any) {
    const { active_only = true, include_stats = false } = args;

    try {
      // Use the query endpoint to search for credit class information
      const response = await apiClient.post('/query', {
        query: "List Regen Network credit classes and ecological credits",
        limit: 20
      });

      const data = response.data as any;
      const results = data.documents || data.results || [];

      let formatted = `# Regen Registry Credit Classes (from Knowledge Base)\n\n`;

      if (results.length === 0) {
        formatted += "No credit class information found in the knowledge base.\n";
      } else {
        for (const doc of results) {
          if (doc.content || doc.text) {
            formatted += `- ${doc.content || doc.text}\n`;
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search for credit classes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getRecentActivity(args: any) {
    const { hours = 24, activity_type = 'all' } = args;

    try {
      // Use query endpoint to search for recent activity
      const response = await apiClient.post('/query', {
        query: `Recent Regen Network activity updates news ${activity_type}`,
        limit: 15
      });

      const data = response.data as any;
      const results = data.documents || data.results || [];
      let formatted = `# Recent Regen Network Activity (Knowledge Base Search)\n\n`;

      if (results.length === 0) {
        formatted += "No recent activity information found in the knowledge base.\n";
      } else {
        for (const doc of results.slice(0, 10)) {
          if (doc.content || doc.text) {
            const text = (doc.content || doc.text).substring(0, 200);
            formatted += `- ${text}...\n`;
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get recent activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractMarkdownFromPreview(stdout: string): string {
    // Extract markdown content between MARKDOWN_CONTENT_START and MARKDOWN_CONTENT_END markers
    const startMarker = 'MARKDOWN_CONTENT_START';
    const endMarker = 'MARKDOWN_CONTENT_END';

    const startIdx = stdout.indexOf(startMarker);
    const endIdx = stdout.lastIndexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
      // Markers not found - return empty string
      return '';
    }

    // Extract the content between markers (skip the === lines)
    const lines = stdout.substring(startIdx, endIdx).split('\n');
    // Skip first 2 lines (marker and ===) and get everything until the last ===
    const contentLines = lines.slice(2, -1);

    return contentLines.join('\n').trim();
  }

  private async generateWeeklyDigest(args: any) {
    const {
      start_date,
      end_date,
      save_to_file = false,
      output_path,
      format = 'markdown'
    } = args || {};

    try {
      // Calculate date range
      const now = new Date();
      const defaultStartDate = new Date(now);
      defaultStartDate.setDate(now.getDate() - 7);

      const startDate = start_date || defaultStartDate.toISOString().split('T')[0];
      const endDate = end_date || now.toISOString().split('T')[0];

      console.error(`[${SERVER_NAME}] Generating weekly digest for ${startDate} to ${endDate}`);

      let markdownContent = '';
      let jsonContent: any = null;
      let usedPythonScript = false;

      // Check if user wants to use local Python script (for advanced users with local database)
      const useLocalPython = process.env.USE_LOCAL_PYTHON_DIGEST === 'true';

      if (useLocalPython) {
        // Try to execute the Python script (for advanced local setup)
        try {
        const { spawn } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');
        const { fileURLToPath } = await import('url');

        // Use paths relative to the MCP server directory
        // In ES modules, we need to use import.meta.url instead of __dirname
        const currentFile = fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentFile);
        const mcpServerDir = path.join(currentDir, '..');
        const scriptPath = path.join(mcpServerDir, 'python', 'scripts', 'run_weekly_aggregator.py');

        // Use koi-processor's venv for WeeklyCuratorLLM dependencies
        const koiProcessorVenv = '/opt/projects/koi-processor/venv/bin/python3';
        const pythonPath = fs.existsSync(koiProcessorVenv) ? koiProcessorVenv : 'python3';

        // Check if Python script exists
        if (!fs.existsSync(scriptPath)) {
          console.error(`[${SERVER_NAME}] Python script not found at ${scriptPath}, using fallback`);
          throw new Error('Python script not found');
        }

      // Build command args - use preview mode when not saving to file
      // Note: The updated script uses WeeklyCuratorLLM and doesn't need --config
      const scriptArgs = [scriptPath];

      if (save_to_file) {
        // Save to file mode - need output directory
        const outputDir = output_path || path.join(mcpServerDir, 'python', 'output', 'weekly_digests');

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        scriptArgs.push('--output-dir', outputDir);

        if (format === 'json') {
          scriptArgs.push('--format', 'json');
        } else if (format === 'markdown') {
          scriptArgs.push('--format', 'markdown');
        } else {
          scriptArgs.push('--format', 'both');
        }
      } else {
        // Preview mode - no file operations
        scriptArgs.push('--preview');
      }

      console.error(`[${SERVER_NAME}] Executing: ${pythonPath} ${scriptArgs.join(' ')}`);

      const pythonProcess = spawn(pythonPath, scriptArgs, {
        cwd: path.join(mcpServerDir, 'python'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Wait for the process to complete
      const exitCode = await new Promise<number>((resolve) => {
        pythonProcess.on('close', resolve);
      });

      if (exitCode !== 0) {
        console.error(`[${SERVER_NAME}] Python script exited with code ${exitCode}`);
        console.error(`[${SERVER_NAME}] stderr: ${stderr}`);

        // Check if this is a "no content" error
        if (stderr.includes('No content found') || stdout.includes('No content found')) {
          console.error(`[${SERVER_NAME}] No content available for digest period, falling back to KOI search`);
          // Don't throw - continue to fallback
        } else {
          throw new Error(`Digest generation script failed: ${stderr || 'Unknown error'}`);
        }
      }

      console.error(`[${SERVER_NAME}] Script completed successfully`);

      let actualFilePath = '';

      // Handle the output based on mode
      if (save_to_file) {
        // File mode - read the generated files
        const fs = await import('fs');
        const path = await import('path');
        const outputDir = output_path || '/opt/projects/koi-processor/output/weekly_digests';

        // Wait a moment for file writes to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (exitCode === 0) {
          try {
            // Look for the most recent file
            const files = fs.readdirSync(outputDir)
              .filter(f => f.startsWith('weekly_digest_') && f.endsWith('.md'))
              .sort()
              .reverse();

            if (files.length > 0) {
              actualFilePath = path.join(outputDir, files[0]);
              markdownContent = fs.readFileSync(actualFilePath, 'utf-8');

              // Try to load corresponding JSON
              const jsonPath = actualFilePath.replace('.md', '.json');
              if (fs.existsSync(jsonPath)) {
                jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
              }
            }
          } catch (readError) {
            console.error(`[${SERVER_NAME}] Could not read generated file:`, readError);
          }
        }
      } else {
        // Preview mode - parse stdout directly
        if (exitCode === 0 && stdout) {
          // The preview output includes both the formatted preview and the markdown content
          // Extract the markdown content from stdout
          markdownContent = this.extractMarkdownFromPreview(stdout);
        }
      }
          usedPythonScript = true;
        } catch (pythonError) {
          // Python script failed - will use KOI API below
          console.error(`[${SERVER_NAME}] Python digest failed, using KOI API:`, pythonError);
        }
      }

      // If no markdown content (either Python disabled or failed), use KOI API weekly-digest endpoint
      if (!markdownContent) {
        console.error(`[${SERVER_NAME}] Generating digest from KOI API /weekly-digest endpoint`);
        try {
          const response = await apiClient.get('/weekly-digest', {
            params: {
              start_date: startDate,
              end_date: endDate,
              format: 'markdown'
            }
          });

          const data = response.data as any;
          if (data.content) {
            markdownContent = data.content;
            usedPythonScript = true; // The API endpoint uses the Python script
            console.error(`[${SERVER_NAME}] Successfully generated digest via API endpoint`);
          } else {
            throw new Error('No content in API response');
          }
        } catch (apiError) {
          console.error(`[${SERVER_NAME}] API weekly-digest endpoint failed, using search fallback:`, apiError);

          // Final fallback: use search
          const searchResults = await this.searchKnowledge({
            query: 'Regen Network activity updates discussions governance',
            limit: 100,
            published_from: startDate,
            published_to: endDate
          });

          // Extract text from search results
          const resultsText = searchResults.content[0].text;

          // Generate markdown digest
          markdownContent = `# Regen Network Weekly Digest\n\n`;
          markdownContent += `**Period:** ${startDate} to ${endDate}\n\n`;
          markdownContent += `## Summary\n\n`;
          markdownContent += `This digest was generated from the KOI knowledge base using semantic search.\n\n`;
          markdownContent += `## Recent Activity\n\n`;
          markdownContent += resultsText;
        }
      }

      // Generate summary statistics
      const wordCount = markdownContent.split(/\s+/).length;
      const sourceCount = (markdownContent.match(/\[Source:/g) || []).length;

      let resultText = '';

      if (format === 'json') {
        const jsonOutput = {
          digest: markdownContent,
          metadata: {
            start_date: startDate,
            end_date: endDate,
            generated_at: new Date().toISOString(),
            word_count: wordCount,
            source_count: sourceCount
          },
          raw_data: jsonContent
        };
        resultText = JSON.stringify(jsonOutput, null, 2);
      } else {
        resultText = markdownContent;
      }

      // Save to file if requested
      let savedFilePath = '';
      if (save_to_file) {
        const fs = await import('fs');
        const path = await import('path');

        savedFilePath = output_path || `weekly_digest_${endDate}.${format === 'json' ? 'json' : 'md'}`;
        fs.writeFileSync(savedFilePath, resultText, 'utf-8');
        console.error(`[${SERVER_NAME}] Saved digest to ${savedFilePath}`);
      }

      // Format response with resource for artifact rendering
      const resourceUri = `digest://weekly/${startDate}_to_${endDate}.${format === 'json' ? 'json' : 'md'}`;
      const mimeType = format === 'json' ? 'application/json' : 'text/markdown';

      // Create summary text
      let summaryText = `Generated weekly digest for ${startDate} to ${endDate}\n\n`;
      if (!usedPythonScript) {
        summaryText += `📡 **Source:** KOI API search\n\n`;
      }
      summaryText += `📊 **Statistics:**\n`;
      summaryText += `- Word Count: ${wordCount}\n`;
      summaryText += `- Sources Referenced: ${sourceCount}\n`;
      if (savedFilePath) {
        summaryText += `- Saved to: ${savedFilePath}\n`;
      }
      summaryText += `\nThe full digest is provided below as a ${format} document.`;

      return {
        content: [
          {
            type: 'text',
            text: summaryText,
          },
          {
            type: 'resource',
            resource: {
              uri: resourceUri,
              mimeType: mimeType,
              text: resultText
            }
          }
        ],
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Error generating weekly digest:`, error);
      throw new Error(`Failed to generate weekly digest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get NotebookLM export with full content (forum posts, Notion pages, etc.)
   *
   * Always saves to a local file to avoid bloating LLM context.
   * Returns just the file path and summary stats.
   */
  private async getNotebookLMExport(args: any) {
    const { output_path } = args || {};

    try {
      console.error(`[${SERVER_NAME}] Fetching NotebookLM export from API`);

      // Call the API endpoint with longer timeout (generation can take 2-3 minutes)
      const response = await apiClient.get('/weekly-digest/notebooklm', {
        timeout: 180000  // 3 minutes
      });
      const data = response.data as any;

      if (!data.success) {
        // Return helpful error message
        const errorMsg = data.error?.message || 'NotebookLM export not available';
        return {
          content: [
            {
              type: 'text',
              text: `## NotebookLM Export Not Available\n\n${errorMsg}\n\n**To generate a NotebookLM export:**\n1. Go to https://regen.gaiaai.xyz/digests/\n2. Click "Generate Weekly Digest"\n3. Wait for generation to complete\n4. Click "Export for NotebookLM"\n5. Then try this tool again to retrieve it`
            }
          ]
        };
      }

      const content = data.content;
      const stats = data.statistics || {};
      const source = data.source || 'api';

      console.error(`[${SERVER_NAME}] Retrieved NotebookLM export: ${stats.word_count || 'unknown'} words from ${source}`);

      // Always save to file to avoid bloating LLM context
      const fs = await import('fs');
      const path = await import('path');
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      // Use provided path or default to current directory
      const fileName = `notebooklm_export_${dateStr}.md`;
      const savedFilePath = output_path || fileName;
      const absolutePath = path.resolve(savedFilePath);

      fs.writeFileSync(absolutePath, content, 'utf-8');
      console.error(`[${SERVER_NAME}] Saved NotebookLM export to ${absolutePath}`);

      // Calculate stats if not provided
      const wordCount = stats.word_count || content.split(/\s+/).length;
      const charCount = stats.char_count || content.length;

      // Build concise summary (no full content - just file reference)
      let summaryText = `## NotebookLM Export Saved Successfully\n\n`;
      summaryText += `**File:** \`${absolutePath}\`\n`;
      summaryText += `**Size:** ${(charCount / 1024).toFixed(1)} KB\n`;
      summaryText += `**Word Count:** ${wordCount.toLocaleString()} words\n`;
      summaryText += `**Source:** ${source === 'cached' ? `Server cache` : 'Freshly generated'}\n\n`;
      summaryText += `The full NotebookLM export has been saved to the file above. `;
      summaryText += `You can open it directly or upload it to NotebookLM for analysis.\n\n`;
      summaryText += `**Contents include:**\n`;
      summaryText += `- Complete forum thread posts\n`;
      summaryText += `- Full Notion page content (including meeting transcripts)\n`;
      summaryText += `- Governance proposal details\n`;
      summaryText += `- On-chain activity summary`;

      return {
        content: [
          {
            type: 'text',
            text: summaryText
          }
        ]
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Error fetching NotebookLM export:`, error);

      // Check if it's a 404 (not available)
      if ((error as any).response?.status === 404) {
        return {
          content: [
            {
              type: 'text',
              text: `## NotebookLM Export Not Available\n\nNo recent NotebookLM export found on the server.\n\n**To generate one:**\n1. Go to https://regen.gaiaai.xyz/digests/\n2. Click "Generate Weekly Digest"\n3. Wait for generation to complete\n4. Click "Export for NotebookLM"\n5. Then try this tool again`
            }
          ]
        };
      }

      throw new Error(`Failed to fetch NotebookLM export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract repository name from GitHub RID
   * RID format: regen.github:github_{repo}_github_sensor_{id}_{repo}_{filepath}#chunk{n}
   * or: regen.github:github_{repo}_{repo}_{filepath}#chunk{n}
   */
  private extractRepoFromRid(rid: string): string {
    // Try pattern with sensor ID first
    let match = rid.match(/regen\.github:github_([^_]+)_github_sensor/);
    if (match) return match[1];

    // Try pattern without sensor ID
    match = rid.match(/regen\.github:github_([^_]+)_([^_]+)/);
    return match ? match[1] : '';
  }

  /**
   * Extract filepath from GitHub RID for deduplication
   * Returns unique file identifier
   */
  private extractFilepathFromRid(rid: string): string {
    // Pattern 1: with sensor ID: _github_sensor_{id}_{repo}_{filepath}#chunk{n}
    let match = rid.match(/_github_sensor_[^_]+_[^_]+_(.+?)(?:#chunk\d+)?$/);
    if (match) return match[1];

    // Pattern 2: without sensor ID: github_{repo}_{repo}_{filepath}#chunk{n}
    match = rid.match(/github_[^_]+_[^_]+_(.+?)(?:#chunk\d+)?$/);
    return match ? match[1] : rid;
  }

  /**
   * Format GitHub documentation search results as markdown
   */
  private formatGithubDocsResults(memories: any[], query: string): string {
    if (memories.length === 0) {
      return `No results found for "${query}" in GitHub documentation.\n\n**Suggestions:**\n- Try broader search terms\n- Check repository name spelling\n- Use \`search_knowledge\` for non-GitHub content`;
    }

    let output = `## GitHub Documentation Search Results\n\n`;
    output += `**Query:** "${query}"\n`;
    output += `**Results:** ${memories.length} documents found\n\n`;

    memories.forEach((memory, index) => {
      // Extract info from RID
      const repo = this.extractRepoFromRid(memory.rid);
      const filepath = this.extractFilepathFromRid(memory.rid);

      // Get relevance score
      const score = memory.similarity
        ? `(relevance: ${(memory.similarity * 100).toFixed(0)}%)`
        : '';

      // Truncate content
      const content = memory.content?.substring(0, 300) || '';

      output += `### ${index + 1}. ${filepath} ${score}\n`;
      output += `**Repository:** ${repo}\n`;
      output += `**RID:** ${memory.rid}\n\n`;
      output += `${content}${content.length >= 300 ? '...' : ''}\n\n`;
      output += `---\n\n`;
    });

    return output;
  }

  /**
   * Search GitHub documentation
   * Implements client-side filtering based on Phase 0 findings
   */
  private async searchGithubDocs(args: any) {
    const startTime = Date.now();
    const { query, repository, limit = 10 } = args;

    console.error(`[${SERVER_NAME}] Tool=search_github_docs Event=start Query="${query.substring(0, 50)}" Repository=${repository || 'all'}`);

    try {
      // Call Bun Hybrid RAG API (uses different field names than Python fallback)
      // Request extra results to account for filtering/deduplication
      const response = await apiClient.post('/query', {
        question: query,  // Bun API uses "question" parameter
        limit: Math.min(limit * 3, 50) // Request 3x to account for client-side filtering
      });

      const data = response.data as any;
      const allMemories = data?.results || [];  // Bun API returns "results" array
      const duration = Date.now() - startTime;

      console.error(`[${SERVER_NAME}] Tool=search_github_docs Event=api_response RawResults=${allMemories.length} Duration=${duration}ms`);

      // CLIENT-SIDE FILTERING (handles Phase 0 issues)
      const filteredMemories = allMemories
        // Filter 1: Only GitHub results (fixes 10-20% leakage from Phase 0)
        .filter((m: any) => m.rid?.startsWith('regen.github:'))

        // Filter 2: Repository filter if specified
        .filter((m: any) => {
          if (!repository) return true;
          const repo = this.extractRepoFromRid(m.rid);
          return repo === repository;
        })

        // Filter 3: Deduplicate by filepath (handles duplicate sensor IDs from Phase 0)
        .filter((m: any, index: number, arr: any[]) => {
          const filepath = this.extractFilepathFromRid(m.rid);
          return arr.findIndex((x: any) =>
            this.extractFilepathFromRid(x.rid) === filepath
          ) === index;
        })

        // Take only requested amount
        .slice(0, limit);

      console.error(`[${SERVER_NAME}] Tool=search_github_docs Event=filtered FilteredResults=${filteredMemories.length}`);

      // Format and return results
      const formattedOutput = this.formatGithubDocsResults(filteredMemories, query);

      console.error(`[${SERVER_NAME}] Tool=search_github_docs Event=success FinalResults=${filteredMemories.length} TotalDuration=${Date.now() - startTime}ms`);

      return {
        content: [{
          type: 'text',
          text: formattedOutput
        }]
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Tool=search_github_docs Event=error`, error);

      // Handle specific error types
      if ((error as any).code === 'ECONNREFUSED') {
        return {
          content: [{
            type: 'text',
            text: 'KOI API is currently unavailable. Please try again later or check your network connection.'
          }]
        };
      }

      if ((error as any).code === 'ETIMEDOUT' || (error as any).message?.includes('timeout')) {
        return {
          content: [{
            type: 'text',
            text: 'Request timed out. The server may be busy. Please try again with a smaller limit.'
          }]
        };
      }

      // Generic error
      return {
        content: [{
          type: 'text',
          text: `Error searching GitHub documentation: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
        }]
      };
    }
  }

  /**
   * Get repository overview
   * Provides structured overview of a specific Regen Network repository
   */
  private async getRepoOverview(args: any) {
    const startTime = Date.now();
    const { repository } = args;

    console.error(`[${SERVER_NAME}] Tool=get_repo_overview Event=start Repository=${repository}`);

    try {
      // Search for README and key documentation files
      const queries = [
        `${repository} README documentation overview`,
        `${repository} CONTRIBUTING guidelines`,
        `${repository} architecture structure`
      ];

      // Execute searches in parallel
      const responses = await Promise.all(
        queries.map(query =>
          apiClient.post('/query', {
            question: query,
            limit: 20
          })
        )
      );

      // Combine and filter all memories
      const allMemories: any[] = [];
      responses.forEach(response => {
        const data = response.data as any;
        const memories = data?.results || [];  // Bun API returns "results"
        allMemories.push(...memories);
      });

      console.error(`[${SERVER_NAME}] Tool=get_repo_overview Event=api_response RawResults=${allMemories.length}`);

      // CLIENT-SIDE FILTERING
      const filteredMemories = allMemories
        // Filter 1: Only GitHub results
        .filter((m: any) => m.rid?.startsWith('regen.github:'))

        // Filter 2: Only specified repository
        .filter((m: any) => {
          const repo = this.extractRepoFromRid(m.rid);
          return repo === repository;
        })

        // Filter 3: Deduplicate by filepath
        .filter((m: any, index: number, arr: any[]) => {
          const filepath = this.extractFilepathFromRid(m.rid);
          return arr.findIndex((x: any) =>
            this.extractFilepathFromRid(x.rid) === filepath
          ) === index;
        });

      console.error(`[${SERVER_NAME}] Tool=get_repo_overview Event=filtered FilteredResults=${filteredMemories.length}`);

      // Format output
      const formattedOutput = this.formatRepoOverview(repository, filteredMemories);

      console.error(`[${SERVER_NAME}] Tool=get_repo_overview Event=success FinalResults=${filteredMemories.length} TotalDuration=${Date.now() - startTime}ms`);

      return {
        content: [{
          type: 'text',
          text: formattedOutput
        }]
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Tool=get_repo_overview Event=error`, error);

      return {
        content: [{
          type: 'text',
          text: `Error getting repository overview: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
        }]
      };
    }
  }

  /**
   * Format repository overview as markdown
   */
  private formatRepoOverview(repository: string, memories: any[]): string {
    let output = `# ${repository} - Repository Overview\n\n`;

    if (memories.length === 0) {
      output += `No documentation found for ${repository}.\n\n`;
      output += `**Note:** The GitHub sensor primarily indexes documentation and config files. `;
      output += `Try using \`search_github_docs\` with specific queries.\n`;
      return output;
    }

    // Categorize files
    const readmeFiles: any[] = [];
    const contributingFiles: any[] = [];
    const docFiles: any[] = [];
    const configFiles: any[] = [];

    memories.forEach(memory => {
      const filepath = this.extractFilepathFromRid(memory.rid).toLowerCase();

      if (filepath.includes('readme')) {
        readmeFiles.push(memory);
      } else if (filepath.includes('contributing') || filepath.includes('code_of_conduct')) {
        contributingFiles.push(memory);
      } else if (filepath.includes('doc') || filepath.includes('.md')) {
        docFiles.push(memory);
      } else {
        configFiles.push(memory);
      }
    });

    // Repository description section
    output += `## Repository Description\n\n`;

    // Use README content if available
    if (readmeFiles.length > 0) {
      const readme = readmeFiles[0];
      const content = readme.content?.substring(0, 400) || '';
      output += `${content}${content.length >= 400 ? '...' : ''}\n\n`;
    } else {
      output += `*No README found. Documentation may be limited for this repository.*\n\n`;
    }

    // Key files section
    output += `## Key Files Found\n\n`;
    output += `**Total Documentation Files:** ${memories.length}\n\n`;

    if (readmeFiles.length > 0) {
      output += `### README Files (${readmeFiles.length})\n`;
      readmeFiles.slice(0, 5).forEach(file => {
        const filepath = this.extractFilepathFromRid(file.rid);
        output += `- ${filepath}\n`;
      });
      output += `\n`;
    }

    if (contributingFiles.length > 0) {
      output += `### Contributing Guidelines (${contributingFiles.length})\n`;
      contributingFiles.slice(0, 3).forEach(file => {
        const filepath = this.extractFilepathFromRid(file.rid);
        output += `- ${filepath}\n`;
      });
      output += `\n`;
    }

    if (docFiles.length > 0) {
      output += `### Documentation Files (${docFiles.length})\n`;
      docFiles.slice(0, 10).forEach(file => {
        const filepath = this.extractFilepathFromRid(file.rid);
        output += `- ${filepath}\n`;
      });
      if (docFiles.length > 10) {
        output += `- ... and ${docFiles.length - 10} more\n`;
      }
      output += `\n`;
    }

    if (configFiles.length > 0) {
      output += `### Configuration Files (${configFiles.length})\n`;
      configFiles.slice(0, 5).forEach(file => {
        const filepath = this.extractFilepathFromRid(file.rid);
        output += `- ${filepath}\n`;
      });
      if (configFiles.length > 5) {
        output += `- ... and ${configFiles.length - 5} more\n`;
      }
      output += `\n`;
    }

    // Links section
    output += `## Links\n\n`;
    output += `- **GitHub:** https://github.com/regen-network/${repository}\n`;
    output += `- **Issues:** https://github.com/regen-network/${repository}/issues\n`;
    output += `- **Pull Requests:** https://github.com/regen-network/${repository}/pulls\n\n`;

    output += `---\n\n`;
    output += `*Use \`search_github_docs\` with repository="${repository}" to explore specific topics.*\n`;

    return output;
  }

  /**
   * Get tech stack information
   * Provides technical stack information for Regen Network repositories
   */
  private async getTechStack(args: any) {
    const startTime = Date.now();
    const { repository } = args;

    console.error(`[${SERVER_NAME}] Tool=get_tech_stack Event=start Repository=${repository || 'all'}`);

    try {
      // Search for tech stack indicators
      const queries = [
        'package.json dependencies frameworks',
        'go.mod go dependencies modules',
        'Dockerfile CI CD configuration',
        'Makefile build tools',
        'Cargo.toml pyproject.toml'
      ];

      // Execute searches in parallel
      const responses = await Promise.all(
        queries.map(query =>
          apiClient.post('/query', {
            question: query,  // Bun API uses "question" parameter
            limit: 15
          })
        )
      );

      // Combine all memories
      const allMemories: any[] = [];
      responses.forEach(response => {
        const data = response.data as any;
        const memories = data?.results || [];  // Bun API returns "results"
        allMemories.push(...memories);
      });

      console.error(`[${SERVER_NAME}] Tool=get_tech_stack Event=api_response RawResults=${allMemories.length}`);

      // CLIENT-SIDE FILTERING
      let filteredMemories = allMemories
        // Filter 1: Only GitHub results
        .filter((m: any) => m.rid?.startsWith('regen.github:'))

        // Filter 2: Repository filter if specified
        .filter((m: any) => {
          if (!repository) return true;
          const repo = this.extractRepoFromRid(m.rid);
          return repo === repository;
        })

        // Filter 3: Deduplicate by filepath
        .filter((m: any, index: number, arr: any[]) => {
          const filepath = this.extractFilepathFromRid(m.rid);
          return arr.findIndex((x: any) =>
            this.extractFilepathFromRid(x.rid) === filepath
          ) === index;
        });

      console.error(`[${SERVER_NAME}] Tool=get_tech_stack Event=filtered FilteredResults=${filteredMemories.length}`);

      // Format output
      const formattedOutput = this.formatTechStack(filteredMemories, repository);

      console.error(`[${SERVER_NAME}] Tool=get_tech_stack Event=success FinalResults=${filteredMemories.length} TotalDuration=${Date.now() - startTime}ms`);

      return {
        content: [{
          type: 'text',
          text: formattedOutput
        }]
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Tool=get_tech_stack Event=error`, error);

      return {
        content: [{
          type: 'text',
          text: `Error getting tech stack: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
        }]
      };
    }
  }

  /**
   * Authenticate user with @regen.network email for access to private documentation
   */
  private async authenticateUser() {
    const startTime = Date.now();

    try {
      console.error(`[${SERVER_NAME}] Tool=regen_koi_authenticate Event=start`);

      // Get user email (same logic as graph_tool.ts uses)
      const userEmail = process.env.REGEN_USER_EMAIL ||
                        process.env.USER_EMAIL ||
                        `${process.env.USER}@regen.network`;

      console.error(`[${SERVER_NAME}] Tool=regen_koi_authenticate UserEmail=${userEmail}`);

      // Call the auth initiate endpoint
      const response = await axios.get(`${KOI_API_ENDPOINT}/auth/initiate`, {
        params: { user_email: userEmail }
      });

      const { auth_url, state } = response.data as { auth_url: string; state: string };

      if (!auth_url) {
        throw new Error('No auth URL returned from server');
      }

      // Open browser for OAuth
      console.error(`[${SERVER_NAME}] Tool=regen_koi_authenticate Event=opening_browser URL=${auth_url}`);

      const open = (await import('open')).default;
      await open(auth_url);

      let output = `## Authentication Started\n\n`;
      output += `✅ Opening browser for OAuth login...\n\n`;
      output += `**Please:**\n`;
      output += `1. Log in with your **@regen.network** email\n`;
      output += `2. Grant the requested permissions (email, profile)\n`;
      output += `3. The browser will show a success message when complete\n\n`;
      output += `**After authenticating:**\n`;
      output += `- Your token is saved on the server\n`;
      output += `- Future queries will automatically include private Drive data\n`;
      output += `- You won't need to authenticate again unless the token expires\n\n`;
      output += `**Polling for authentication completion...**\n`;

      // Poll for authentication status
      const pollUrl = `${KOI_API_ENDPOINT}/auth/status?user_email=${encodeURIComponent(userEmail)}`;
      const maxAttempts = 60; // 2 minutes
      const pollInterval = 2000; // 2 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusResponse = await axios.get<{
            authenticated: boolean;
            session_token?: string;  // Our server's token, NOT Google OAuth
            token_expiry?: string;
          }>(pollUrl);

          if (statusResponse.data.authenticated) {
            console.error(`[${SERVER_NAME}] Tool=regen_koi_authenticate Event=success Duration=${Date.now() - startTime}ms`);

            // Store the session token for future API calls
            // SECURITY: This is our server's session token, NOT a Google OAuth token
            // Safe to store - only works with our API, can't access Google
            if (statusResponse.data.session_token) {
              const tokenExpiry = statusResponse.data.token_expiry
                ? new Date(statusResponse.data.token_expiry).getTime()
                : undefined;
              setAccessToken(statusResponse.data.session_token, tokenExpiry);
            }

            output += `\n✅ **Authentication Successful!**\n\n`;
            output += `Authenticated as: ${userEmail}\n\n`;
            output += `You now have access to internal Regen Network documentation.\n`;
            output += `Private Notion data from the main Regen workspace is now accessible.\n`;

            return {
              content: [{
                type: 'text',
                text: output
              }]
            };
          }
        } catch (pollError) {
          // Continue polling
        }
      }

      // Timeout
      throw new Error('Authentication timeout - please try again');

    } catch (error) {
      console.error(`[${SERVER_NAME}] Tool=regen_koi_authenticate Event=error`, error);

      return {
        content: [{
          type: 'text',
          text: `## Authentication Error\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}\n\nPlease try again or contact support if the issue persists.`
        }]
      };
    }
  }

  /**
   * Format tech stack information as markdown
   */
  private formatTechStack(memories: any[], repository?: string): string {
    const repoFilter = repository ? ` for ${repository}` : '';
    let output = `# Technical Stack${repoFilter}\n\n`;

    if (memories.length === 0) {
      output += `No tech stack information found${repoFilter}.\n\n`;
      output += `**Note:** The GitHub sensor primarily indexes documentation and config files. `;
      output += `Some tech stack files may not be available.\n`;
      return output;
    }

    // Categorize by file type and repository
    const repoData: { [key: string]: {
      packageJson: any[],
      goMod: any[],
      dockerfiles: any[],
      makefiles: any[],
      cargo: any[],
      ci: any[],
      other: any[]
    }} = {};

    memories.forEach(memory => {
      const repo = this.extractRepoFromRid(memory.rid);
      const filepath = this.extractFilepathFromRid(memory.rid).toLowerCase();

      if (!repoData[repo]) {
        repoData[repo] = {
          packageJson: [],
          goMod: [],
          dockerfiles: [],
          makefiles: [],
          cargo: [],
          ci: [],
          other: []
        };
      }

      if (filepath.includes('package.json')) {
        repoData[repo].packageJson.push(memory);
      } else if (filepath.includes('go.mod') || filepath.includes('go.sum')) {
        repoData[repo].goMod.push(memory);
      } else if (filepath.includes('dockerfile')) {
        repoData[repo].dockerfiles.push(memory);
      } else if (filepath.includes('makefile')) {
        repoData[repo].makefiles.push(memory);
      } else if (filepath.includes('cargo.toml') || filepath.includes('pyproject.toml')) {
        repoData[repo].cargo.push(memory);
      } else if (filepath.includes('.yml') || filepath.includes('.yaml') || filepath.includes('ci')) {
        repoData[repo].ci.push(memory);
      } else {
        repoData[repo].other.push(memory);
      }
    });

    // Output by repository
    const repos = Object.keys(repoData).sort();

    repos.forEach(repo => {
      const data = repoData[repo];
      output += `## ${repo}\n\n`;

      // Determine primary language/stack
      const languages: string[] = [];
      if (data.packageJson.length > 0) languages.push('JavaScript/TypeScript (Node.js)');
      if (data.goMod.length > 0) languages.push('Go');
      if (data.cargo.length > 0) languages.push('Rust/Python');

      if (languages.length > 0) {
        output += `**Primary Languages:** ${languages.join(', ')}\n\n`;
      }

      // Package dependencies
      if (data.packageJson.length > 0) {
        output += `### JavaScript/TypeScript Dependencies\n`;
        data.packageJson.forEach(file => {
          const filepath = this.extractFilepathFromRid(file.rid);
          output += `- **${filepath}**\n`;

          // Try to extract dependency info from content
          const content = file.content || '';
          const depsMatch = content.match(/"dependencies":\s*{([^}]+)}/);
          if (depsMatch) {
            const deps = depsMatch[1].split(',').slice(0, 5);
            deps.forEach((dep: string) => {
              const cleaned = dep.trim().replace(/"/g, '');
              if (cleaned) output += `  - ${cleaned}\n`;
            });
            if (depsMatch[1].split(',').length > 5) {
              output += `  - ... and more\n`;
            }
          }
        });
        output += `\n`;
      }

      // Go modules
      if (data.goMod.length > 0) {
        output += `### Go Modules\n`;
        data.goMod.forEach(file => {
          const filepath = this.extractFilepathFromRid(file.rid);
          output += `- **${filepath}**\n`;

          // Try to extract module info from content
          const content = file.content || '';
          const lines = content.split('\n').filter((l: string) => l.trim().startsWith('require')).slice(0, 5);
          lines.forEach((line: string) => {
            const cleaned = line.trim();
            if (cleaned) output += `  - ${cleaned}\n`;
          });
        });
        output += `\n`;
      }

      // Build tools
      if (data.makefiles.length > 0 || data.dockerfiles.length > 0) {
        output += `### Build Tools & Infrastructure\n`;

        if (data.makefiles.length > 0) {
          output += `**Makefiles:**\n`;
          data.makefiles.slice(0, 3).forEach(file => {
            const filepath = this.extractFilepathFromRid(file.rid);
            output += `- ${filepath}\n`;
          });
        }

        if (data.dockerfiles.length > 0) {
          output += `**Docker:**\n`;
          data.dockerfiles.slice(0, 3).forEach(file => {
            const filepath = this.extractFilepathFromRid(file.rid);
            output += `- ${filepath}\n`;
          });
        }
        output += `\n`;
      }

      // CI/CD
      if (data.ci.length > 0) {
        output += `### CI/CD Configuration\n`;
        data.ci.slice(0, 5).forEach(file => {
          const filepath = this.extractFilepathFromRid(file.rid);
          output += `- ${filepath}\n`;
        });
        if (data.ci.length > 5) {
          output += `- ... and ${data.ci.length - 5} more\n`;
        }
        output += `\n`;
      }

      output += `---\n\n`;
    });

    output += `*Use \`search_github_docs\` to explore specific dependency or configuration files.*\n`;

    return output;
  }

  private formatSearchResults(results: any[], query: string): string {
    if (!results || results.length === 0) {
      return `No results found for query: "${query}"`;
    }

    let formatted = `# Search Results for: "${query}"\n\n`;
    formatted += `Found ${results.length} relevant documents:\n\n`;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      formatted += `## Result ${i + 1} (Confidence: ${(result.score * 100).toFixed(1)}%)\n`;

      if (result.rid) {
        formatted += `**RID**: ${result.rid}\n`;
      }

      if (result.title) {
        formatted += `**Title**: ${result.title}\n`;
      }

      if (result.source) {
        formatted += `**Source**: ${result.source}\n`;
      }

      formatted += `**Content**: ${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}\n`;

      if (result.metadata) {
        formatted += `**Metadata**: ${JSON.stringify(result.metadata, null, 2)}\n`;
      }

      formatted += `\n---\n\n`;
    }

    return formatted;
  }

  /**
   * Handle hybrid search - intelligent routing based on query classification
   */
  private async handleHybridSearch(args: any) {
    const { query, limit = 10 } = args;

    // Check if hybrid search is available
    if (!this.queryRouter || !this.unifiedSearch) {
      console.error(`[${SERVER_NAME}] Hybrid search not available - falling back to vector search`);
      return await this.searchKnowledge({ query, limit });
    }

    try {
      const startTime = Date.now();

      // Step 1: Classify query
      const classification = await this.queryRouter.classifyQuery(query);
      console.error(`[${SERVER_NAME}] Query classified as: ${classification.intent} (route: ${classification.recommended_route})`);

      let results: any[] = [];
      let searchMetadata: any = {};

      // Step 2: Execute appropriate search based on classification
      if (classification.recommended_route === 'graph' && classification.detected_entities.length > 0) {
        // Graph-only search for entity queries
        const entityNames = classification.detected_entities.map(e => e.name);
        const graphResults = await this.unifiedSearch.graphSearch(entityNames, limit);

        results = graphResults.map(hit => ({
          id: hit.id,
          title: hit.title,
          content: hit.content || '',
          source: 'graph',
          entity_type: hit.entity_type,
          file_path: hit.file_path,
          line_number: hit.line_number,
          score: hit.final_score,
        }));

        searchMetadata = {
          route: 'graph',
          entities_detected: entityNames,
        };

      } else if (classification.recommended_route === 'vector') {
        // Vector-only search for conceptual queries - use KOI API
        const response = await apiClient.post('/query', {
          question: query,
          limit: limit
        });

        const data = response.data as any;
        results = (data.results || []).map((r: any) => ({
          id: r.rid || r.id,
          title: r.title || 'Document',
          content: r.content || '',
          source: 'vector',
          score: r.score || 0,
          metadata: r.metadata,
        }));

        searchMetadata = {
          route: 'vector',
        };

      } else {
        // Unified/hybrid search - combine graph and vector
        // For now, use vector search as we don't have embedding service integrated
        console.error(`[${SERVER_NAME}] Unified search requested but falling back to vector search (embedding service not integrated)`);
        const response = await apiClient.post('/query', {
          question: query,
          limit: limit
        });

        const data = response.data as any;
        results = (data.results || []).map((r: any) => ({
          id: r.rid || r.id,
          title: r.title || 'Document',
          content: r.content || '',
          source: 'vector',
          score: r.score || 0,
          metadata: r.metadata,
        }));

        searchMetadata = {
          route: 'hybrid_fallback_to_vector',
          entities_detected: classification.detected_entities.map(e => e.name),
          note: 'Embedding service not available - using vector search only',
        };
      }

      const duration = Date.now() - startTime;

      // Step 3: Format results
      const markdown = this.formatHybridResults(results, classification, searchMetadata);

      // MCP only supports type: 'text' - embed JSON as code block
      const jsonData = JSON.stringify({
        hits: results,
        classification,
        metadata: {
          query,
          route: classification.recommended_route,
          duration_ms: duration,
          total_results: results.length,
          ...searchMetadata,
        },
      }, null, 2);

      return {
        content: [
          {
            type: 'text',
            text: markdown + '\n\n---\n\n<details>\n<summary>Raw JSON (for eval harness)</summary>\n\n```json\n' + jsonData + '\n```\n</details>',
          },
        ],
      };

    } catch (error) {
      console.error(`[${SERVER_NAME}] Hybrid search error:`, error);
      // Fallback to basic search
      return await this.searchKnowledge({ query, limit });
    }
  }

  /**
   * Format hybrid search results as markdown
   */
  private formatHybridResults(results: any[], classification: any, metadata: any): string {
    let output = `## Hybrid Search Results\n\n`;
    output += `**Query Route:** ${metadata.route} (intent: ${classification.intent})\n`;

    if (classification.detected_entities.length > 0) {
      output += `**Detected Entities:** ${classification.detected_entities.map((e: any) => e.name).join(', ')}\n`;
    }

    output += `**Confidence:** ${(classification.confidence * 100).toFixed(1)}%\n`;
    output += `**Results:** ${results.length}\n\n`;

    if (classification.reasoning) {
      output += `*${classification.reasoning}*\n\n`;
    }

    if (metadata.note) {
      output += `> **Note:** ${metadata.note}\n\n`;
    }

    output += `---\n\n`;

    results.forEach((hit, i) => {
      output += `### ${i + 1}. ${hit.title || hit.id}\n`;

      if (hit.entity_type) {
        output += `**Type:** ${hit.entity_type} | `;
      }

      output += `**Source:** ${hit.source}`;

      if (hit.score !== undefined) {
        output += ` | **Score:** ${hit.score.toFixed(3)}`;
      }

      output += `\n\n`;

      if (hit.file_path) {
        output += `📁 \`${hit.file_path}\``;
        if (hit.line_number) {
          output += `:${hit.line_number}`;
        }
        output += `\n\n`;
      }

      if (hit.content) {
        const preview = hit.content.substring(0, 300);
        output += `${preview}${hit.content.length > 300 ? '...' : ''}\n\n`;
      }

      output += `---\n\n`;
    });

    return output;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[${SERVER_NAME}] Server running on stdio transport`);
    // Fire-and-forget warm-up to avoid first-query cold start
    this.warmUp().catch(() => {});
  }

  private async warmUp() {
    try {
      // Jena warm-up
      await this.sparqlClient.executeQuery('SELECT (COUNT(*) AS ?c) WHERE { ?s ?p ?o } LIMIT 1');
    } catch {}
    try {
      // KOI API warm-up (vector path)
      await apiClient.post('/query', { query: 'warmup', limit: 1 });
    } catch {}
    console.error(`[${SERVER_NAME}] Warm-up probes completed`);
  }
}

// Main execution
async function main() {
  const server = new KOIServer();
  await server.run();
}

main().catch((error) => {
  logger.fatal({
    action: 'fatal_error',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  }, 'Fatal error starting MCP server');
  process.exit(1);
});
