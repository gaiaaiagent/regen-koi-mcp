/**
 * Tool definitions for Regen KOI MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'search_knowledge',
    description: 'General text search in the Regen Network knowledge base. Use this for searching documents by keywords or phrases. For graph queries about specific entities or relationships, use query_graph instead.',
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
    description: 'Query the knowledge graph for specific entities and their relationships. Use this when asked to "query graph" for something. This performs structured graph traversal to find entities and their connections.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Entity name or SPARQL-like query (e.g., "Greg Landua", "SELECT ?s WHERE { ?s rdf:type :Person }")'
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