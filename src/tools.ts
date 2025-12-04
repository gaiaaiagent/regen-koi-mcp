/**
 * Tool definitions for Regen KOI MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GRAPH_TOOL } from './graph_tool.js';

export const TOOLS: Tool[] = [
  GRAPH_TOOL,
  {
    name: 'hybrid_search',
    description: 'Intelligent search that automatically routes to graph (for entity/relationship queries) or vector (for conceptual queries) based on query intent. Uses QueryRouter for classification and UnifiedSearch for hybrid retrieval with RRF fusion. Best for general questions about the Regen codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about Regen code, architecture, or documentation'
        },
        limit: {
          type: 'number',
          default: 10,
          minimum: 1,
          maximum: 50,
          description: 'Maximum results to return (default: 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_knowledge',
    description: 'Hybrid search across KOI (vectors + graph). Accepts optional published date range filter.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "carbon credits", "Regen Registry governance")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20)',
          minimum: 1,
          maximum: 20,
          default: 5
        },
        published_from: {
          type: 'string',
          format: 'date',
          description: 'Filter: include only content published on/after this date (YYYY-MM-DD)'
        },
        published_to: {
          type: 'string',
          format: 'date',
          description: 'Filter: include only content published on/before this date (YYYY-MM-DD)'
        },
        include_undated: {
          type: 'boolean',
          description: 'When using a date filter, also include documents with no known publication date',
          default: false
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
    name: 'generate_weekly_digest',
    description: 'Generate a weekly digest SUMMARY of Regen Network activity. Returns a curated markdown brief with executive summary, governance analysis, community discussions, and on-chain metrics. This is a condensed overview - use get_notebooklm_export for full content with complete forum posts and Notion pages.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          format: 'date',
          description: 'Start date for digest period (YYYY-MM-DD). Defaults to 7 days ago.'
        },
        end_date: {
          type: 'string',
          format: 'date',
          description: 'End date for digest period (YYYY-MM-DD). Defaults to today.'
        },
        save_to_file: {
          type: 'boolean',
          description: 'Whether to save the digest to a file on disk. Default: false',
          default: false
        },
        output_path: {
          type: 'string',
          description: 'Custom file path for saving (only used if save_to_file is true). Defaults to timestamped filename in current directory.'
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Output format. Default: markdown',
          default: 'markdown'
        }
      }
    }
  },
  {
    name: 'get_notebooklm_export',
    description: 'Get the full NotebookLM export with COMPLETE content including: full forum thread posts, complete Notion page content (all chunks), enriched URLs, and detailed source material. Automatically saves to a local file to avoid bloating LLM context. Returns the file path and summary stats.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: {
          type: 'string',
          description: 'Custom file path for saving. Defaults to notebooklm_export_YYYY-MM-DD.md in the current directory.'
        }
      }
    }
  },
  {
    name: 'search_github_docs',
    description: 'Search Regen Network GitHub repositories for documentation, README files, configuration files, and technical content. Searches regen-ledger (blockchain), regen-web (frontend), regen-data-standards (schemas), and regenie-corpus (docs). Note: Currently searches documentation and config files, not source code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "ecocredit module", "validator setup", "governance voting")'
        },
        repository: {
          type: 'string',
          description: 'Optional: Filter by specific repo. Omit to search all 4 repositories.',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          default: 10,
          description: 'Maximum number of results to return'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_repo_overview',
    description: 'Get a structured overview of a specific Regen Network repository including description, key files (README, CONTRIBUTING, etc.), and links to documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'Repository to get overview for',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
        }
      },
      required: ['repository']
    }
  },
  {
    name: 'get_tech_stack',
    description: 'Get technical stack information for Regen Network repositories including languages, frameworks, dependencies, build tools, and infrastructure. Can show all repos or filter to a specific one.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'Optional: Filter to specific repo. Omit to show all repositories.',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
        }
      }
    }
  },
  {
    name: 'get_mcp_metrics',
    description: 'Get MCP server performance metrics, cache statistics, and health status. Useful for monitoring and debugging. Returns uptime, tool latencies, cache hit rates, error counts, and circuit breaker status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'regen_koi_authenticate',
    description: 'Authenticate with your @regen.network email to access internal Regen Network documentation in addition to public sources. Opens a browser window for secure OAuth login. Authentication token is saved on the server and persists across sessions. Only needs to be done once.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];
