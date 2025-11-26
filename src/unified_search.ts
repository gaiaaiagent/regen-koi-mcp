/**
 * Unified Search - Single-Query Hybrid Search with RRF
 *
 * Combines graph-based entity search and vector semantic search
 * in a SINGLE PostgreSQL query using Reciprocal Rank Fusion (RRF).
 *
 * Key Design Principles:
 * 1. NO parallel database calls - Everything in one SQL query
 * 2. Database does the work - RRF calculated in Postgres
 * 3. Unified stack - AGE + pgvector in same database
 *
 * RRF Formula: score = 1.0 / (k + rank) where k=60
 * This gives higher scores to higher-ranked results, with diminishing returns.
 */

import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;

// Configuration
export interface UnifiedSearchConfig {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  graphName?: string;
  embeddingDimension?: 384 | 512 | 768 | 1024 | 1536 | 3072;
  rrfConstant?: number;  // k parameter in RRF formula (default: 60)
}

// Search result
export interface SearchHit {
  id: string;
  title: string;
  content?: string;
  source: 'graph' | 'vector' | 'module' | 'both';
  graph_rank?: number;
  vector_rank?: number;
  module_rank?: number;
  rrf_score: number;
  final_score: number;
  entity_type?: string;
  file_path?: string;
  line_number?: number;
  docstring?: string;
}

// Module search result
export interface ModuleHit {
  name: string;
  repo: string;
  path: string;
  summary?: string;
  entity_count: number;
  score: number;
}

/**
 * UnifiedSearch - Hybrid search combining graph and vector results with RRF
 */
export class UnifiedSearch {
  private pool: PoolType;
  private graphName: string;
  private embeddingDim: string;
  private rrfK: number;

  constructor(config: UnifiedSearchConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
    this.graphName = config.graphName || 'regen_graph';
    this.embeddingDim = `dim_${config.embeddingDimension || 1536}`;
    this.rrfK = config.rrfConstant || 60;
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Execute unified hybrid search - Single SQL query with RRF
   *
   * @param queryText - Natural language query
   * @param queryEmbedding - Pre-computed query embedding vector
   * @param entityNames - Entity names detected by router (optional, improves graph results)
   * @param limit - Maximum results to return (default: 10)
   */
  async search(
    queryText: string,
    queryEmbedding: number[],
    entityNames: string[] = [],
    limit: number = 10
  ): Promise<SearchHit[]> {
    const client = await this.pool.connect();
    try {
      // Load AGE extension for this session
      await client.query("LOAD 'age';");
      await client.query(`SET search_path = ag_catalog, "$user", public;`);

      // Build the unified hybrid search query
      const query = `
        WITH graph_hits AS (
          -- Graph: Entity-based search using detected entities
          SELECT
            'graph_' || (e->>'name')::text || '_' || id(e)::text as id,
            (e->>'name')::text as title,
            (e->>'docstring')::text as content,
            (e->>'file_path')::text as file_path,
            (e->>'line_number')::int as line_number,
            'graph' as source,
            labels(e)[0]::text as entity_type,
            ROW_NUMBER() OVER (ORDER BY id(e)) as rank
          FROM cypher('${this.graphName}', $$
            MATCH (e)
            WHERE e.name = ANY($1::text[])
            RETURN e
          $$, $2) as (e agtype)
          WHERE e IS NOT NULL
          LIMIT 10
        ),
        vector_hits AS (
          -- Vector: Semantic search on document embeddings
          SELECT
            m.id::text as id,
            COALESCE(m.metadata->>'title', m.rid) as title,
            m.content::text as content,
            m.metadata->>'file_path' as file_path,
            NULL::int as line_number,
            'vector' as source,
            NULL::text as entity_type,
            ROW_NUMBER() OVER (ORDER BY e.${this.embeddingDim} <=> $3::vector) as rank
          FROM koi_memories m
          INNER JOIN koi_embeddings e ON e.memory_id = m.id
          WHERE e.${this.embeddingDim} IS NOT NULL
            AND m.superseded_at IS NULL
          ORDER BY e.${this.embeddingDim} <=> $3::vector
          LIMIT 10
        ),
        combined AS (
          -- Combine graph and vector results
          SELECT
            id,
            title,
            content,
            file_path,
            line_number,
            source,
            entity_type,
            rank,
            1.0 / ($4::float + rank) as rrf_score
          FROM graph_hits
          UNION ALL
          SELECT
            id,
            title,
            content,
            file_path,
            line_number,
            source,
            entity_type,
            rank,
            1.0 / ($4::float + rank) as rrf_score
          FROM vector_hits
        ),
        aggregated AS (
          -- Aggregate scores for items appearing in both sources
          SELECT
            id,
            MAX(title) as title,
            MAX(content) as content,
            MAX(file_path) as file_path,
            MAX(line_number) as line_number,
            MAX(entity_type) as entity_type,
            CASE
              WHEN COUNT(DISTINCT source) > 1 THEN 'both'
              ELSE MAX(source)
            END as source,
            MAX(CASE WHEN source = 'graph' THEN rank END) as graph_rank,
            MAX(CASE WHEN source = 'vector' THEN rank END) as vector_rank,
            SUM(rrf_score) as final_score
          FROM combined
          GROUP BY id
        )
        SELECT
          id,
          title,
          content,
          file_path,
          line_number,
          entity_type,
          source,
          graph_rank,
          vector_rank,
          final_score,
          final_score as rrf_score  -- For backwards compatibility
        FROM aggregated
        ORDER BY final_score DESC
        LIMIT $5
      `;

      // Convert embedding to postgres array format
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const result = await client.query(query, [
        entityNames.length > 0 ? entityNames : ['__NONE__'],  // Fallback if no entities
        JSON.stringify(entityNames.length > 0 ? entityNames : ['__NONE__']),
        embeddingStr,
        this.rrfK,
        limit
      ]);

      return result.rows as SearchHit[];
    } finally {
      client.release();
    }
  }

  /**
   * Graph-only search (for entity lookup / relationship queries)
   */
  async graphSearch(entityNames: string[], limit: number = 10): Promise<SearchHit[]> {
    const client = await this.pool.connect();
    try {
      await client.query("LOAD 'age';");
      await client.query(`SET search_path = ag_catalog, "$user", public;`);

      const query = `
        SELECT
          'graph_' || (e->>'name')::text || '_' || id(e)::text as id,
          (e->>'name')::text as title,
          (e->>'docstring')::text as content,
          (e->>'file_path')::text as file_path,
          (e->>'line_number')::int as line_number,
          labels(e)[0]::text as entity_type,
          'graph' as source,
          ROW_NUMBER() OVER (ORDER BY id(e)) as graph_rank,
          NULL::int as vector_rank,
          1.0 as rrf_score,
          1.0 as final_score
        FROM cypher('${this.graphName}', $$
          MATCH (e)
          WHERE e.name = ANY($1::text[])
          RETURN e
        $$, $2) as (e agtype)
        WHERE e IS NOT NULL
        LIMIT $3
      `;

      const result = await client.query(query, [
        entityNames,
        JSON.stringify(entityNames),
        limit
      ]);

      return result.rows as SearchHit[];
    } finally {
      client.release();
    }
  }

  /**
   * Vector-only search (for conceptual / semantic queries)
   */
  async vectorSearch(queryEmbedding: number[], limit: number = 10): Promise<SearchHit[]> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const query = `
      SELECT
        m.id::text as id,
        COALESCE(m.metadata->>'title', m.rid) as title,
        m.content::text as content,
        m.metadata->>'file_path' as file_path,
        NULL::int as line_number,
        NULL::text as entity_type,
        'vector' as source,
        NULL::int as graph_rank,
        ROW_NUMBER() OVER (ORDER BY e.${this.embeddingDim} <=> $1::vector) as vector_rank,
        (1.0 - (e.${this.embeddingDim} <=> $1::vector)) as rrf_score,
        (1.0 - (e.${this.embeddingDim} <=> $1::vector)) as final_score
      FROM koi_memories m
      INNER JOIN koi_embeddings e ON e.memory_id = m.id
      WHERE e.${this.embeddingDim} IS NOT NULL
        AND m.superseded_at IS NULL
      ORDER BY e.${this.embeddingDim} <=> $1::vector
      LIMIT $2
    `;

    const result = await this.pool.query(query, [embeddingStr, limit]);
    return result.rows as SearchHit[];
  }

  /**
   * Module-level semantic search (RAPTOR)
   * Searches module summaries by vector similarity
   */
  async moduleSearch(queryEmbedding: number[], limit: number = 5): Promise<ModuleHit[]> {
    const client = await this.pool.connect();
    try {
      await client.query("LOAD 'age';");
      await client.query(`SET search_path = ag_catalog, "$user", public;`);

      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Search module summaries stored in koi_memories with type='module_summary'
      const query = `
        SELECT
          m.rid,
          m.content as summary,
          m.metadata->>'repo' as repo,
          m.metadata->>'path' as path,
          m.metadata->>'title' as title,
          COALESCE((m.metadata->>'entity_count')::int, 0) as entity_count,
          (1.0 - (e.${this.embeddingDim} <=> $1::vector)) as score
        FROM koi_memories m
        INNER JOIN koi_embeddings e ON e.memory_id = m.id
        WHERE e.${this.embeddingDim} IS NOT NULL
          AND m.superseded_at IS NULL
          AND m.metadata->>'type' = 'module_summary'
        ORDER BY e.${this.embeddingDim} <=> $1::vector
        LIMIT $2
      `;

      const result = await client.query(query, [embeddingStr, limit]);

      return result.rows.map(row => ({
        name: row.rid.replace('module:', '').split('/').pop() || row.title,
        repo: row.repo || row.rid.split('/')[0]?.replace('module:', ''),
        path: row.path || '',
        summary: row.summary,
        entity_count: row.entity_count,
        score: parseFloat(row.score) || 0
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Combined search including modules (RAPTOR-enhanced hybrid search)
   * For high-level conceptual queries, searches module summaries first
   */
  async searchWithModules(
    queryText: string,
    queryEmbedding: number[],
    entityNames: string[] = [],
    options: { includeModules?: boolean; moduleLimit?: number; limit?: number } = {}
  ): Promise<{ hits: SearchHit[]; moduleHits: ModuleHit[] }> {
    const { includeModules = true, moduleLimit = 3, limit = 10 } = options;

    // Run standard search
    const hits = await this.search(queryText, queryEmbedding, entityNames, limit);

    // Also search modules if enabled
    let moduleHits: ModuleHit[] = [];
    if (includeModules) {
      try {
        moduleHits = await this.moduleSearch(queryEmbedding, moduleLimit);
      } catch (error) {
        // Module search is optional - if it fails, just return empty
        console.error('[UnifiedSearch] Module search failed:', error);
      }
    }

    return { hits, moduleHits };
  }

  /**
   * Get search statistics
   */
  async getStats(): Promise<{
    total_memories: number;
    total_embeddings: number;
    embedding_coverage: number;
    graph_entities: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("LOAD 'age';");
      await client.query(`SET search_path = ag_catalog, "$user", public;`);

      const queries = await Promise.all([
        this.pool.query('SELECT COUNT(*) as count FROM koi_memories WHERE superseded_at IS NULL'),
        this.pool.query(`SELECT COUNT(*) as count FROM koi_embeddings WHERE ${this.embeddingDim} IS NOT NULL`),
        client.query(`
          SELECT COUNT(*) as count
          FROM cypher('${this.graphName}', $$
            MATCH (e)
            RETURN count(e)
          $$) as (count agtype)
        `)
      ]);

      const total_memories = parseInt(queries[0].rows[0].count);
      const total_embeddings = parseInt(queries[1].rows[0].count);
      const graph_entities = parseInt(queries[2].rows[0].count);

      return {
        total_memories,
        total_embeddings,
        embedding_coverage: total_memories > 0 ? total_embeddings / total_memories : 0,
        graph_entities
      };
    } finally {
      client.release();
    }
  }
}

/**
 * Create a default UnifiedSearch instance using environment variables
 */
export function createUnifiedSearch(): UnifiedSearch {
  return new UnifiedSearch({
    host: process.env.GRAPH_DB_HOST || 'localhost',
    port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
    database: process.env.GRAPH_DB_NAME || 'eliza',
    user: process.env.GRAPH_DB_USER,
    password: process.env.GRAPH_DB_PASSWORD,
    graphName: process.env.GRAPH_NAME || 'regen_graph',
    embeddingDimension: parseInt(process.env.EMBEDDING_DIM || '1536') as any,
    rrfConstant: parseInt(process.env.RRF_K || '60'),
  });
}
