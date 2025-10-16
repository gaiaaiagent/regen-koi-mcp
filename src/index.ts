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
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

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

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'search_knowledge',
    description: 'Search the Regen Network KOI knowledge graph using hybrid RAG (semantic + keyword search). Returns relevant documents about ecological credits, methodologies, projects, and governance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "carbon credits", "biodiversity methodology", "Regen Registry")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20)',
          minimum: 1,
          maximum: 20,
          default: 5
        },
        filters: {
          type: 'object',
          description: 'Optional filters to narrow search results',
          properties: {
            source_type: {
              type: 'string',
              enum: ['documentation', 'governance', 'methodology', 'project', 'credit_class', 'all'],
              description: 'Filter by content type'
            },
            date_range: {
              type: 'object',
              properties: {
                start: { type: 'string', format: 'date' },
                end: { type: 'string', format: 'date' }
              }
            }
          }
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_entity',
    description: 'Retrieve detailed information about a specific entity by its RID (Resource Identifier) or name. Use this for credit classes, projects, methodologies, or other specific resources.',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The RID (e.g., "orn:credit_class:C03") or name (e.g., "Voluntary Carbon Units")'
        },
        include_related: {
          type: 'boolean',
          description: 'Include related entities and relationships',
          default: true
        }
      },
      required: ['identifier']
    }
  },
  {
    name: 'query_graph',
    description: 'Execute SPARQL queries against the KOI knowledge graph for complex relationship queries',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SPARQL query to execute'
        },
        format: {
          type: 'string',
          enum: ['json', 'table', 'graph'],
          default: 'json',
          description: 'Output format for results'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_stats',
    description: 'Get statistics about the KOI knowledge base including document counts, data sources, and recent updates',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Include detailed breakdown by source and type',
          default: false
        }
      }
    }
  },
  {
    name: 'list_credit_classes',
    description: 'List all available credit classes in the Regen Registry with their key properties',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: {
          type: 'boolean',
          description: 'Only show active credit classes',
          default: true
        },
        include_stats: {
          type: 'boolean',
          description: 'Include issuance statistics',
          default: false
        }
      }
    }
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent activity in the Regen Network ecosystem including new credits, projects, and governance proposals',
    inputSchema: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'Number of hours to look back (default: 24, max: 168)',
          minimum: 1,
          maximum: 168,
          default: 24
        },
        activity_type: {
          type: 'string',
          enum: ['all', 'credits', 'governance', 'projects', 'methodologies'],
          default: 'all'
        }
      }
    }
  }
];

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

      const results = response.data.results || [];
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
      // Try to get entity by RID or name
      const response = await apiClient.get(`/entity/${encodeURIComponent(identifier)}`, {
        params: { include_related }
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
      const response = await apiClient.post('/sparql', {
        query,
        format
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
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
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