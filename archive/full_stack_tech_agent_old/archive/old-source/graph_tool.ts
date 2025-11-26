/**
 * Graph Tool - MCP Tool for Querying Regen Code Knowledge Graph
 *
 * Provides an MCP tool interface for querying the Apache AGE graph database
 * containing Regen Network code entities and relationships.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  GraphClient,
  createGraphClient,
  KeeperForMsgResult,
  MsgForKeeperResult,
  DocMentioningResult,
  EntityInDocResult,
  RelatedEntity,
} from './graph_client.js';

// Tool definition following the pattern from tools.ts
export const GRAPH_TOOL: Tool = {
  name: 'query_code_graph',
  description: 'Query the Regen code knowledge graph to find relationships between Keepers, Messages, Events, and Documentation',
  inputSchema: {
    type: 'object',
    properties: {
      query_type: {
        type: 'string',
        enum: ['keeper_for_msg', 'msgs_for_keeper', 'docs_mentioning', 'entities_in_doc', 'related_entities'],
        description: 'Type of graph query to execute'
      },
      entity_name: {
        type: 'string',
        description: 'Name of the entity to query (e.g., "MsgCreateBatch", "Keeper")'
      },
      doc_path: {
        type: 'string',
        description: 'Document path for doc-related queries'
      }
    },
    required: ['query_type']
  }
};

/**
 * ToolResponse interface matching CODE_EXAMPLES.md specification
 */
interface ToolResponse {
  content: Array<{
    type: 'text' | 'json';
    text?: string;
    data?: any;
  }>;
}

/**
 * Hit interface for structured results
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
}

/**
 * Execute the query_code_graph tool
 */
export async function executeGraphTool(args: any): Promise<ToolResponse> {
  const { query_type, entity_name, doc_path } = args;

  // Validate required parameters
  if (!query_type) {
    return {
      content: [{
        type: 'text',
        text: 'Error: query_type is required'
      }]
    };
  }

  // Create graph client
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

      default:
        return {
          content: [{
            type: 'text',
            text: `Error: Unknown query_type: ${query_type}`
          }]
        };
    }

    const duration_ms = Date.now() - startTime;

    // Return response following CODE_EXAMPLES.md format
    return {
      content: [
        {
          type: 'text',
          text: markdownSummary
        },
        {
          type: 'json',
          data: {
            hits,
            metadata: {
              query_type,
              entity_name: entity_name || doc_path,
              duration_ms,
              total_results
            }
          }
        }
      ]
    };

  } catch (error) {
    console.error('[query_code_graph] Error:', error);
    return {
      content: [{
        type: 'text',
        text: `Error querying graph: ${error instanceof Error ? error.message : 'Unknown error'}`
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
