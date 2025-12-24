/**
 * Tool definitions for Regen KOI MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GRAPH_TOOL } from './graph_tool.js';

export const TOOLS: Tool[] = [
  GRAPH_TOOL,
  {
    name: 'search',
    description: 'Search the Regen Network knowledge base. Automatically uses hybrid search (vector + graph + keyword) with entity boosting. Supports date filtering. NOT for live blockchain queries - use Ledger MCP for on-chain state.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "carbon credits", "Regen Registry governance")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)',
          minimum: 1,
          maximum: 50,
          default: 10
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
    description: 'Search Regen Network GitHub repositories for documentation, README files, configuration files, and technical content. Searches regen-ledger (blockchain), regen-web (frontend), regen-data-standards (schemas), and regenie-corpus (docs). Searches docs only - use Ledger MCP for on-chain data.',
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
  },
  {
    name: 'resolve_entity',
    description: 'Resolve an ambiguous label to a canonical KOI entity. Returns ranked matches with URIs, types, and confidence scores. Use this when you have a label (like "ethereum" or "regen commons") and need to find the exact entity in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'The label to resolve (e.g., "ethereum", "notion", "regen commons")'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint to narrow results (e.g., "TECHNOLOGY", "ORGANIZATION", "PERSON")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of candidates to return (default: 5)',
          minimum: 1,
          maximum: 20,
          default: 5
        }
      },
      required: ['label']
    }
  },
  {
    name: 'get_entity_neighborhood',
    description: 'Get the graph neighborhood of an entity - its direct relationships and connected entities. Returns edges with predicates (like "mentions", "relates_to") and neighboring nodes. Useful for understanding context and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Entity label to look up (will be resolved if ambiguous)'
        },
        uri: {
          type: 'string',
          description: 'Entity URI (preferred if known, e.g., from resolve_entity)'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint for disambiguation'
        },
        direction: {
          type: 'string',
          enum: ['out', 'in', 'both'],
          description: 'Edge direction: "out" (entity→neighbors), "in" (neighbors→entity), or "both" (default)',
          default: 'both'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of edges to return (default: 20)',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      }
    }
  },
  {
    name: 'get_entity_documents',
    description: 'Get documents associated with an entity. Returns document references (chunks) that mention or relate to the entity. Respects privacy: unauthenticated requests only see public documents.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Entity label to look up'
        },
        uri: {
          type: 'string',
          description: 'Entity URI (preferred if known)'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint for disambiguation'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return (default: 10)',
          minimum: 1,
          maximum: 50,
          default: 10
        }
      }
    }
  }
];
