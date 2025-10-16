#!/usr/bin/env node
/**
 * Regen KOI MCP Remote Server
 * HTTP/SSE server that can be accessed remotely via URL
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'http://localhost:8301/api/koi';
const KOI_API_KEY = process.env.KOI_API_KEY || '';
const SERVER_NAME = process.env.MCP_SERVER_NAME || 'regen-koi';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

// OAuth configuration (optional)
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

// API client configuration
const apiClient = axios.create({
  baseURL: KOI_API_ENDPOINT,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(KOI_API_KEY ? { 'Authorization': `Bearer ${KOI_API_KEY}` } : {})
  }
});

// Tool definitions (same as index.ts)
import { TOOLS } from './tools.js';

class KOIRemoteServer {
  private app: express.Application;
  private mcpServer: Server;

  constructor() {
    this.app = express();
    this.mcpServer = new Server(
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
    this.setupMCPHandlers();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // CORS configuration for Claude Desktop
    this.app.use(cors({
      origin: '*', // Allow all origins for MCP clients
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-MCP-Version'],
      credentials: true
    }));

    this.app.use(express.json());

    // Basic authentication middleware (optional)
    if (REQUIRE_AUTH) {
      this.app.use((req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        // Simple bearer token auth
        const token = authHeader.replace('Bearer ', '');
        if (token !== KOI_API_KEY) {
          return res.status(403).json({ error: 'Invalid authentication token' });
        }

        next();
      });
    }
  }

  private setupMCPHandlers() {
    // Setup tool handlers
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params);
    });
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: true
      });
    });

    // MCP metadata endpoint
    this.app.get('/mcp', (req, res) => {
      res.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocol: 'mcp',
        transport: 'sse',
        endpoint: `http://${req.get('host')}/sse`,
        capabilities: {
          tools: true,
          resources: false,
          prompts: false
        },
        authentication: REQUIRE_AUTH ? {
          type: 'bearer',
          required: true
        } : null
      });
    });

    // SSE endpoint for MCP
    this.app.get('/sse', async (req, res) => {
      console.log(`[${SERVER_NAME}] New SSE connection from ${req.ip}`);

      const transport = new SSEServerTransport('/sse', res as any);
      await this.mcpServer.connect(transport);

      console.log(`[${SERVER_NAME}] SSE client connected`);
    });

    // OAuth endpoints (if configured)
    if (OAUTH_CLIENT_ID) {
      this.app.get('/oauth/authorize', (req, res) => {
        // Simplified OAuth flow
        const { redirect_uri, state } = req.query;
        // In production, implement proper OAuth flow
        res.redirect(`${redirect_uri}?code=temp_code&state=${state}`);
      });

      this.app.post('/oauth/token', (req, res) => {
        // Simplified token exchange
        res.json({
          access_token: 'temp_access_token',
          token_type: 'Bearer',
          expires_in: 3600
        });
      });
    }
  }

  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;

    try {
      console.log(`[${SERVER_NAME}] Executing tool: ${name}`);

      switch (name) {
        case 'search_knowledge':
          return await this.searchKnowledge(args);
        case 'get_entity':
          return await this.getEntity(args);
        case 'query_graph':
          return await this.queryGraph(args);
        case 'get_stats':
          return await this.getStats(args);
        case 'list_credit_classes':
          return await this.listCreditClasses(args);
        case 'get_recent_activity':
          return await this.getRecentActivity(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[${SERVER_NAME}] Error executing tool ${name}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        }],
      };
    }
  }

  // Tool implementations (same as index.ts)
  private async searchKnowledge(args: any) {
    const { query, limit = 5, filters = {} } = args;

    try {
      const response = await apiClient.post('/query', {
        question: query,
        limit,
        filters
      });

      const results = response.data.results || [];
      const formattedResults = this.formatSearchResults(results, query);

      return {
        content: [{
          type: 'text',
          text: formattedResults,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to search knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getEntity(args: any) {
    const { identifier, include_related = true } = args;

    try {
      const response = await apiClient.get(`/entity/${encodeURIComponent(identifier)}`, {
        params: { include_related }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async queryGraph(args: any) {
    const { query, format = 'json' } = args;

    try {
      const response = await apiClient.post('/sparql', {
        query,
        format
      });

      return {
        content: [{
          type: 'text',
          text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2),
        }],
      };
    } catch (error) {
      throw new Error(`Failed to execute SPARQL query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getStats(args: any) {
    const { detailed = false } = args;

    try {
      const response = await apiClient.get('/stats', {
        params: { detailed }
      });

      const stats = response.data;
      let formatted = `# KOI Knowledge Base Statistics\n\n`;
      formatted += `- **Total Documents**: ${stats.total_memories || 0}\n`;
      formatted += `- **Total Entities**: ${stats.total_entities || 0}\n`;
      formatted += `- **Data Sources**: ${stats.total_sensors || 0}\n`;
      formatted += `- **Last Updated**: ${stats.last_update || 'Unknown'}\n`;

      if (detailed && stats.breakdown) {
        formatted += `\n## Detailed Breakdown\n`;
        for (const [source, count] of Object.entries(stats.breakdown)) {
          formatted += `- ${source}: ${count}\n`;
        }
      }

      return {
        content: [{
          type: 'text',
          text: formatted,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async listCreditClasses(args: any) {
    const { active_only = true, include_stats = false } = args;

    try {
      const response = await apiClient.get('/credit-classes', {
        params: { active_only, include_stats }
      });

      const classes = response.data.credit_classes || [];
      let formatted = `# Regen Registry Credit Classes\n\n`;

      for (const cls of classes) {
        formatted += `## ${cls.id}: ${cls.name}\n`;
        formatted += `- **Admin**: ${cls.admin}\n`;
        formatted += `- **Metadata**: ${cls.metadata || 'N/A'}\n`;
        if (include_stats && cls.stats) {
          formatted += `- **Total Issued**: ${cls.stats.total_issued || 0}\n`;
          formatted += `- **Active Projects**: ${cls.stats.active_projects || 0}\n`;
        }
        formatted += `\n`;
      }

      return {
        content: [{
          type: 'text',
          text: formatted,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to list credit classes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getRecentActivity(args: any) {
    const { hours = 24, activity_type = 'all' } = args;

    try {
      const response = await apiClient.get('/activity', {
        params: { hours, activity_type }
      });

      const activities = response.data.activities || [];
      let formatted = `# Recent Regen Network Activity (Last ${hours} hours)\n\n`;

      for (const activity of activities) {
        formatted += `- **[${activity.type}]** ${activity.description}`;
        formatted += ` (${activity.timestamp})\n`;
      }

      if (activities.length === 0) {
        formatted += `No recent activity found.\n`;
      }

      return {
        content: [{
          type: 'text',
          text: formatted,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get recent activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  async start() {
    this.app.listen(PORT as number, HOST, () => {
      console.log(`[${SERVER_NAME}] Remote MCP server running at http://${HOST}:${PORT}`);
      console.log(`[${SERVER_NAME}] SSE endpoint: http://${HOST}:${PORT}/sse`);
      console.log(`[${SERVER_NAME}] Health check: http://${HOST}:${PORT}/health`);
      console.log(`[${SERVER_NAME}] MCP info: http://${HOST}:${PORT}/mcp`);
      console.log(`[${SERVER_NAME}] Authentication: ${REQUIRE_AUTH ? 'Enabled' : 'Disabled'}`);
    });
  }
}

// Main execution
async function main() {
  const server = new KOIRemoteServer();
  await server.start();
}

main().catch((error) => {
  console.error('[regen-koi] Fatal error:', error);
  process.exit(1);
});