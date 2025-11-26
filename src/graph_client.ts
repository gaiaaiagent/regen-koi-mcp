/**
 * Graph Client - Apache AGE Query Abstraction Layer
 *
 * Provides a clean interface for querying the Regen code knowledge graph
 * stored in PostgreSQL with Apache AGE extension.
 */

import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;

// Configuration
interface GraphClientConfig {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  graphName: string;
}

// Entity types
export interface Keeper {
  name: string;
  file_path: string;
  line_number: number;
  docstring?: string;
  fields?: string[];
}

export interface Msg {
  name: string;
  file_path: string;
  line_number: number;
  docstring?: string;
  fields?: string[];
  package?: string;
}

export interface Document {
  title: string;
  file_path: string;
  rid?: string;
  content?: string;
}

export interface Entity {
  type: string;
  name: string;
  file_path?: string;
  line_number?: number;
  docstring?: string;
}

export interface RelatedEntity {
  name: string;
  type: string;
  shared_docs?: number;
}

// RAPTOR Module types
export interface Module {
  name: string;
  repo: string;
  path: string;
  summary?: string;
  entity_count: number;
}

export interface ModuleSearchResult {
  name: string;
  repo: string;
  path: string;
  summary?: string;
  entity_count: number;
  score?: number;
}

export interface ModuleEntity {
  type: string;
  name: string;
  file_path?: string;
  line_number?: number;
}

// Query response types
export interface KeeperForMsgResult {
  keeper_name: string;
  keeper_file_path: string;
  keeper_line_number: number;
}

export interface MsgForKeeperResult {
  msg_name: string;
  msg_package?: string;
}

export interface DocMentioningResult {
  file_path: string;
  title: string;
}

export interface EntityInDocResult {
  type: string;
  name: string;
}

/**
 * GraphClient - Interface for querying the code knowledge graph
 */
export class GraphClient {
  private pool: PoolType;
  private graphName: string;

  constructor(config: GraphClientConfig) {
    this.graphName = config.graphName;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Execute a raw Cypher query
   */
  private async executeCypher<T>(query: string, params: any[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      // Load AGE extension for this session
      await client.query("LOAD 'age';");
      await client.query(`SET search_path = ag_catalog, "$user", public;`);

      // Apache AGE requires wrapping the cypher() call with column definitions
      // We use a generic 'result agtype' column and parse the results
      const cypherQuery = `SELECT * FROM ag_catalog.cypher('${this.graphName}', $$ ${query} $$) as (result agtype)`;
      const result = await client.query(cypherQuery, params);

      // AGE returns results wrapped in agtype format
      return result.rows.map((row: any) => {
        const agtypeValue = row.result;

        // Parse the agtype value - it can be a vertex, edge, or primitive
        if (agtypeValue === null || agtypeValue === undefined) {
          return null as any;
        }

        // AGE returns agtype as objects that need to be parsed
        let parsed: any;

        if (typeof agtypeValue === 'string') {
          // String-encoded JSON
          try {
            parsed = JSON.parse(agtypeValue);
          } catch {
            parsed = agtypeValue;
          }
        } else if (typeof agtypeValue === 'object') {
          // Already an object - might be a vertex/edge or a map
          if (agtypeValue.properties) {
            // This is a vertex or edge - extract properties
            parsed = agtypeValue.properties;
          } else {
            // This is a plain object/map
            parsed = agtypeValue;
          }
        } else {
          // Primitive value
          parsed = agtypeValue;
        }

        return parsed as T;
      }).filter((item: any) => item !== null);
    } finally {
      client.release();
    }
  }

  /**
   * Query 1: Find which Keeper handles a given Msg
   */
  async getKeeperForMsg(msgName: string): Promise<KeeperForMsgResult[]> {
    const query = `
      MATCH (k:Keeper)-[:HANDLES]->(m:Msg {name: '${msgName}'})
      RETURN {keeper_name: k.name, keeper_file_path: k.file_path, keeper_line_number: k.line_number}
    `;

    return this.executeCypher<KeeperForMsgResult>(query);
  }

  /**
   * Query 2: List all Msgs a Keeper handles
   */
  async getMsgsForKeeper(keeperName: string): Promise<MsgForKeeperResult[]> {
    const query = `
      MATCH (k:Keeper {name: '${keeperName}'})-[:HANDLES]->(m:Msg)
      RETURN {msg_name: m.name, msg_package: m.package}
    `;

    return this.executeCypher<MsgForKeeperResult>(query);
  }

  /**
   * Query 3: Find documents that mention an entity
   */
  async getDocsMentioning(entityName: string): Promise<DocMentioningResult[]> {
    const query = `
      MATCH (d:Document)-[:MENTIONS]->(e {name: '${entityName}'})
      RETURN {file_path: d.file_path, title: d.title}
    `;

    return this.executeCypher<DocMentioningResult>(query);
  }

  /**
   * Query 4: Find all entities mentioned in a document
   */
  async getEntitiesInDoc(docPath: string): Promise<EntityInDocResult[]> {
    const query = `
      MATCH (d:Document {file_path: '${docPath}'})-[:MENTIONS]->(e)
      RETURN {type: labels(e)[0], name: e.name}
    `;

    return this.executeCypher<EntityInDocResult>(query);
  }

  /**
   * Query 5: Find entities related to a given entity (via shared docs or direct edges)
   */
  async getRelatedEntities(entityName: string): Promise<RelatedEntity[]> {
    const query = `
      MATCH (e1 {name: '${entityName}'})<-[:MENTIONS]-(d:Document)-[:MENTIONS]->(e2)
      WHERE e1 <> e2
      WITH DISTINCT e2, count(d) as shared_docs
      RETURN {name: e2.name, type: labels(e2)[0], shared_docs: shared_docs}
      ORDER BY shared_docs DESC
    `;

    return this.executeCypher<RelatedEntity>(query);
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<{ node_counts: Record<string, number>, edge_counts: Record<string, number> }> {
    // Count nodes by label
    const nodeQuery = `
      MATCH (n)
      WITH labels(n)[0] as label, count(*) as count
      RETURN {label: label, count: count}
    `;
    const nodeResults = await this.executeCypher<{ label: string, count: number }>(nodeQuery);

    // Count edges by type
    const edgeQuery = `
      MATCH ()-[r]->()
      WITH type(r) as type, count(*) as count
      RETURN {type: type, count: count}
    `;
    const edgeResults = await this.executeCypher<{ type: string, count: number }>(edgeQuery);

    const node_counts: Record<string, number> = {};
    nodeResults.forEach(r => {
      node_counts[r.label] = r.count;
    });

    const edge_counts: Record<string, number> = {};
    edgeResults.forEach(r => {
      edge_counts[r.type] = r.count;
    });

    return { node_counts, edge_counts };
  }

  /**
   * Search for entities by name pattern
   */
  async searchEntities(pattern: string, entityType?: string): Promise<Entity[]> {
    const typeFilter = entityType ? `labels(e)[0] = '${entityType}' AND` : '';
    const query = `
      MATCH (e)
      WHERE ${typeFilter} e.name =~ '.*${pattern}.*'
      RETURN {type: labels(e)[0], name: e.name, file_path: e.file_path, line_number: e.line_number, docstring: e.docstring}
      LIMIT 50
    `;

    return this.executeCypher<Entity>(query);
  }

  /**
   * Get all Keepers
   */
  async getAllKeepers(): Promise<Keeper[]> {
    const query = `
      MATCH (k:Keeper)
      RETURN {name: k.name, file_path: k.file_path, line_number: k.line_number, docstring: k.docstring, fields: k.fields}
    `;

    return this.executeCypher<Keeper>(query);
  }

  /**
   * Get all Msgs
   */
  async getAllMsgs(): Promise<Msg[]> {
    const query = `
      MATCH (m:Msg)
      RETURN {name: m.name, file_path: m.file_path, line_number: m.line_number, docstring: m.docstring, fields: m.fields, package: m.package}
    `;

    return this.executeCypher<Msg>(query);
  }

  // ============= Multi-Language Entity Queries =============

  /**
   * Get entities by repository name
   */
  async getEntitiesByRepo(repoName: string, limit: number = 50): Promise<Entity[]> {
    const query = `
      MATCH (r:Repository {name: '${repoName}'})-[:CONTAINS]->(e)
      RETURN {type: labels(e)[0], name: e.name, file_path: e.file_path, line_number: e.line_number, docstring: e.docstring}
      LIMIT ${limit}
    `;
    return this.executeCypher<Entity>(query);
  }

  /**
   * Get entities by type (Sensor, Handler, Class, Interface, Function, etc.)
   */
  async getEntitiesByType(typeName: string, limit: number = 50): Promise<Entity[]> {
    const query = `
      MATCH (e:${typeName})
      RETURN {type: labels(e)[0], name: e.name, file_path: e.file_path, line_number: e.line_number, docstring: e.docstring}
      LIMIT ${limit}
    `;
    return this.executeCypher<Entity>(query);
  }

  /**
   * Search entities by name (case-insensitive contains)
   */
  async findEntitiesByName(searchTerm: string, limit: number = 20): Promise<Entity[]> {
    // Use toLower for case-insensitive matching
    const query = `
      MATCH (e)
      WHERE toLower(e.name) CONTAINS toLower('${searchTerm}')
      RETURN {type: labels(e)[0], name: e.name, file_path: e.file_path, line_number: e.line_number, docstring: e.docstring, repo: e.repo, language: e.language}
      ORDER BY e.name
      LIMIT ${limit}
    `;
    return this.executeCypher<Entity>(query);
  }

  /**
   * Get all repositories with entity counts
   */
  async getRepositories(): Promise<Array<{ name: string; entity_count: number }>> {
    const query = `
      MATCH (r:Repository)-[:CONTAINS]->(e)
      WITH r.name as name, count(e) as entity_count
      RETURN {name: name, entity_count: entity_count}
    `;
    return this.executeCypher<{ name: string; entity_count: number }>(query);
  }

  /**
   * Get entity type distribution for a repository
   */
  async getRepoEntityTypes(repoName: string): Promise<Array<{ type: string; count: number }>> {
    const query = `
      MATCH (r:Repository {name: '${repoName}'})-[:CONTAINS]->(e)
      WITH labels(e)[0] as type, count(*) as count
      RETURN {type: type, count: count}
      ORDER BY count DESC
    `;
    return this.executeCypher<{ type: string; count: number }>(query);
  }

  // ============= RAPTOR Module Queries =============

  /**
   * Get all modules with their summaries
   */
  async getAllModules(limit: number = 50): Promise<Module[]> {
    const query = `
      MATCH (m:Module)
      RETURN {name: m.name, repo: m.repo, path: m.path, summary: m.summary, entity_count: m.entity_count}
      ORDER BY m.entity_count DESC
      LIMIT ${limit}
    `;
    return this.executeCypher<Module>(query);
  }

  /**
   * Get a specific module by name
   */
  async getModule(moduleName: string, repo?: string): Promise<Module | null> {
    const repoFilter = repo ? `repo: '${repo}',` : '';
    const query = `
      MATCH (m:Module {${repoFilter} name: '${moduleName}'})
      RETURN {name: m.name, repo: m.repo, path: m.path, summary: m.summary, entity_count: m.entity_count}
      LIMIT 1
    `;
    const results = await this.executeCypher<Module>(query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Search modules by name pattern (case-insensitive)
   */
  async searchModules(pattern: string, limit: number = 10): Promise<ModuleSearchResult[]> {
    const query = `
      MATCH (m:Module)
      WHERE toLower(m.name) CONTAINS toLower('${pattern}')
         OR toLower(m.summary) CONTAINS toLower('${pattern}')
      RETURN {name: m.name, repo: m.repo, path: m.path, summary: m.summary, entity_count: m.entity_count}
      ORDER BY m.entity_count DESC
      LIMIT ${limit}
    `;
    return this.executeCypher<ModuleSearchResult>(query);
  }

  /**
   * Get all entities contained in a module
   */
  async getModuleEntities(moduleName: string, repo?: string, limit: number = 50): Promise<ModuleEntity[]> {
    const repoFilter = repo ? `repo: '${repo}',` : '';
    const query = `
      MATCH (m:Module {${repoFilter} name: '${moduleName}'})-[:CONTAINS]->(e)
      RETURN {type: labels(e)[0], name: e.name, file_path: e.file_path, line_number: e.line_number}
      LIMIT ${limit}
    `;
    return this.executeCypher<ModuleEntity>(query);
  }

  /**
   * Get modules by repository
   */
  async getModulesByRepo(repoName: string, limit: number = 20): Promise<Module[]> {
    const query = `
      MATCH (m:Module {repo: '${repoName}'})
      RETURN {name: m.name, repo: m.repo, path: m.path, summary: m.summary, entity_count: m.entity_count}
      ORDER BY m.entity_count DESC
      LIMIT ${limit}
    `;
    return this.executeCypher<Module>(query);
  }

  /**
   * Find which module contains a given entity
   */
  async getModuleForEntity(entityName: string): Promise<Module | null> {
    const query = `
      MATCH (m:Module)-[:CONTAINS]->(e {name: '${entityName}'})
      RETURN {name: m.name, repo: m.repo, path: m.path, summary: m.summary, entity_count: m.entity_count}
      LIMIT 1
    `;
    const results = await this.executeCypher<Module>(query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get module statistics (count by repo)
   */
  async getModuleStats(): Promise<Array<{ repo: string; module_count: number; total_entities: number }>> {
    const query = `
      MATCH (m:Module)
      WITH m.repo as repo, count(m) as module_count, sum(m.entity_count) as total_entities
      RETURN {repo: repo, module_count: module_count, total_entities: total_entities}
      ORDER BY total_entities DESC
    `;
    return this.executeCypher<{ repo: string; module_count: number; total_entities: number }>(query);
  }
}

/**
 * Create a default GraphClient instance using environment variables
 */
export function createGraphClient(): GraphClient {
  return new GraphClient({
    host: process.env.GRAPH_DB_HOST || 'localhost',
    port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
    database: process.env.GRAPH_DB_NAME || 'eliza',
    user: process.env.GRAPH_DB_USER,
    password: process.env.GRAPH_DB_PASSWORD,
    graphName: process.env.GRAPH_NAME || 'regen_graph',
  });
}
