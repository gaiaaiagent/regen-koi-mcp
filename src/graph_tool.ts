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
  Module,
  ModuleSearchResult,
  ModuleEntity,
} from './graph_client.js';

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
          // RAPTOR module queries
          'list_modules', 'get_module', 'search_modules', 'module_entities', 'module_for_entity'
        ],
        description: 'Type of graph query: find_by_type (get all Sensors, Handlers, etc.), search_entities (search by name), list_repos (show indexed repositories), list_modules (show all modules), search_modules (search modules by keyword)'
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
export async function executeGraphTool(args: any) {
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
