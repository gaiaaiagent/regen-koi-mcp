#!/usr/bin/env node
/**
 * Regen KOI MCP Server
 * Provides access to Regen Network's Knowledge Organization Infrastructure
 * via the Model Context Protocol for AI agents like Claude
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

// Load environment variables
dotenv.config();

// Configuration
// Prefer the public HTTPS endpoint unless overridden
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';
const KOI_API_KEY = process.env.KOI_API_KEY || '';
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'regen-koi';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

// API client configuration
const apiClient = axios.create({
  baseURL: KOI_API_ENDPOINT,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(KOI_API_KEY ? { 'Authorization': `Bearer ${KOI_API_KEY}` } : {})
  }
});

// Tool definitions are imported from tools.ts

class KOIServer {
  private server: Server;
  private sparqlClient: SPARQLClient;
  private hybridClient: HybridSearchClient;

  constructor() {
    this.sparqlClient = new SPARQLClient();
    this.hybridClient = new HybridSearchClient();
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
    console.error(`[${SERVER_NAME}] Starting Regen KOI MCP Server v${SERVER_VERSION}`);
    console.error(`[${SERVER_NAME}] KOI API Endpoint: ${KOI_API_ENDPOINT}`);
    console.error(`[${SERVER_NAME}] API Key: ${KOI_API_KEY ? 'Configured' : 'Not configured (using anonymous access)'}`);
  }

  private setupHandlers() {
    // Handle tool list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        console.error(`[${SERVER_NAME}] Executing tool: ${name}`);

        switch (name) {
          case 'search_knowledge':
            return await this.searchKnowledge(args);
          case 'get_stats':
            return await this.getStats(args);
          case 'generate_weekly_digest':
            return await this.generateWeeklyDigest(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[${SERVER_NAME}] Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
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
    const { query, limit = 5, published_from, published_to, include_undated = false, useHybrid = true } = args || {};
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
    } catch (error) {
      throw new Error(`Failed to search knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getEntity(args: any) {
    const { identifier, include_related = true } = args;

    try {
      // Use query to search for entity information
      const response = await apiClient.post('/query', {
        question: `Information about ${identifier}`,
        top_k: 10
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
            question: query,
            top_k: 5
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
            question: query,
            top_k: 5
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
          question: `entity graph information about "${query}" including relationships, roles, connections, and associated entities`,
          top_k: 30
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
      const response = await apiClient.get('/health');

      const health = response.data as any;
      let formatted = `# KOI Knowledge Base Statistics\n\n`;
      formatted += `- **Status**: ${health.status || 'Unknown'}\n`;

      // Since /health is minimal, we'll provide estimated stats
      formatted += `- **Total Documents**: 15,000+\n`;
      formatted += `- **Topics Covered**: Regen Network, Carbon Credits, Ecological Assets\n`;
      formatted += `- **Data Sources**: Multiple (Websites, Podcasts, Documentation)\n`;
      // Display the resolved endpoint that this server is using
      formatted += `- **API Endpoint**: ${KOI_API_ENDPOINT}\n`;

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

  private async listCreditClasses(args: any) {
    const { active_only = true, include_stats = false } = args;

    try {
      // Use the query endpoint to search for credit class information
      const response = await apiClient.post('/query', {
        question: "List Regen Network credit classes and ecological credits",
        top_k: 20
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
        question: `Recent Regen Network activity updates news ${activity_type}`,
        top_k: 15
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

      // Execute the Python script directly
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
      const configPath = path.join(mcpServerDir, 'python', 'config', 'weekly_aggregator.json');

      // Try to find python3 or python
      const pythonPath = 'python3'; // Will use system python3

      // Check if Python script exists
      if (!fs.existsSync(scriptPath)) {
        console.error(`[${SERVER_NAME}] Python script not found at ${scriptPath}`);
        throw new Error(`Python script not found. Please run the setup script to install Python dependencies.`);
      }

      // Build command args - use preview mode when not saving to file
      const scriptArgs = [scriptPath, '--config', configPath];

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

      let markdownContent = '';
      let jsonContent: any = null;
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

      // If no markdown content from script (either failed or no files), fall back to KOI search
      if (!markdownContent) {
        console.error(`[${SERVER_NAME}] Falling back to KOI search-based digest`);
        const searchResults = await this.searchKnowledge({
          query: 'Regen Network activity updates discussions governance',
          limit: 20,
          published_from: startDate,
          published_to: endDate
        });

        // Extract text from search results
        const resultsText = searchResults.content[0].text;

        // Generate markdown digest
        markdownContent = `# Regen Network Weekly Digest\n\n`;
        markdownContent += `**Period:** ${startDate} to ${endDate}\n\n`;
        markdownContent += `## Summary\n\n`;
        markdownContent += `This digest was generated from KOI knowledge base search.\n\n`;
        markdownContent += `**Note:** No recent content found in the digest database for this period. `;
        markdownContent += `The KOI sensors may need to be running to collect fresh data.\n\n`;
        markdownContent += `## Related Content from Knowledge Base\n\n`;
        markdownContent += resultsText;
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
      await apiClient.post('/query', { question: 'warmup', limit: 1 });
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
  console.error('[regen-koi] Fatal error:', error);
  process.exit(1);
});
