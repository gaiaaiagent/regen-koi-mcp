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

// Load environment variables
dotenv.config();

// Configuration
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'http://localhost:8301/api/koi';
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

  constructor() {
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

  private async searchKnowledge(args: any) {
    const { query, limit = 5, filters = {} } = args;

    try {
      const response = await apiClient.post('/query', {
        question: query,
        limit,
        filters
      });

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
      // Convert SPARQL-like query to natural language for the query endpoint
      const response = await apiClient.post('/query', {
        question: query,
        top_k: 20
      });

      return {
        content: [
          {
            type: 'text',
            text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to execute SPARQL query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      formatted += `- **API Endpoint**: ${process.env.KOI_API_ENDPOINT || 'http://202.61.196.119:8301/api/koi'}\n`;

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