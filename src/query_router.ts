/**
 * Query Router - Intelligent query classification using pg_trgm
 *
 * Routes queries to the appropriate search strategy:
 * - Graph: Entity relationship queries (e.g., "What does Keeper handle?")
 * - Vector: Conceptual/semantic queries (e.g., "How does consensus work?")
 * - Unified: Hybrid queries combining entities and concepts
 *
 * Key Design Principles:
 * 1. Entity detection via pg_trgm (NO JavaScript array scanning)
 * 2. Database does the work - trigram similarity matching in SQL
 * 3. Classification based on entities + keyword patterns
 */

import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;

// Configuration
export interface RouterConfig {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  entitySimilarityThreshold?: number;  // Trigram similarity threshold (0.0-1.0)
}

// Detected entity from trigram matching
export interface DetectedEntity {
  name: string;
  entity_type: 'Keeper' | 'Msg';
  node_id: string;
  score: number;  // Trigram similarity score
}

// Query classification result
export interface QueryClassification {
  intent: 'entity_lookup' | 'relationship' | 'conceptual' | 'hybrid';
  detected_entities: DetectedEntity[];
  recommended_route: 'graph' | 'vector' | 'unified';
  confidence: number;  // 0.0-1.0
  reasoning: string;   // Explanation of classification
}

/**
 * QueryRouter - Classifies natural language queries for intelligent routing
 */
export class QueryRouter {
  private pool: PoolType;
  private similarityThreshold: number;

  constructor(config: RouterConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
    this.similarityThreshold = config.entitySimilarityThreshold || 0.15;
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Detect entities in a query using pg_trgm trigram similarity
   * This replaces JavaScript array scanning with efficient database queries
   */
  async detectEntities(queryText: string): Promise<DetectedEntity[]> {
    const query = `
      SELECT
        name,
        entity_type,
        node_id,
        similarity(name, $1) as score
      FROM entity_lookup
      WHERE name % $1
         OR $1 ILIKE '%' || name || '%'
      ORDER BY score DESC
      LIMIT 10
    `;

    const result = await this.pool.query(query, [queryText]);
    return result.rows.filter(row => row.score >= this.similarityThreshold);
  }

  /**
   * Classify a query to determine routing strategy
   */
  async classifyQuery(queryText: string): Promise<QueryClassification> {
    // Step 1: Detect entities using pg_trgm (database does the work!)
    const entities = await this.detectEntities(queryText);
    const hasEntities = entities.length > 0;
    const entityScore = hasEntities ? entities[0].score : 0;

    // Step 2: Pattern detection for query intent
    const patterns = this.analyzePatterns(queryText);

    // Step 3: Classification logic
    if (hasEntities && patterns.isRelationship) {
      // Entity + relationship words → Graph search
      return {
        intent: 'relationship',
        detected_entities: entities,
        recommended_route: 'graph',
        confidence: this.calculateConfidence(entityScore, patterns.relationshipScore),
        reasoning: `Query mentions entities (${entities.map(e => e.name).join(', ')}) with relationship keywords. Best served by graph traversal.`
      };
    } else if (hasEntities && patterns.isConceptual) {
      // Entity + conceptual words → Hybrid search
      return {
        intent: 'hybrid',
        detected_entities: entities,
        recommended_route: 'unified',
        confidence: this.calculateConfidence(entityScore, patterns.conceptualScore),
        reasoning: `Query combines entities (${entities.map(e => e.name).join(', ')}) with conceptual questions. Hybrid search recommended.`
      };
    } else if (hasEntities) {
      // Entities only → Entity lookup via graph
      return {
        intent: 'entity_lookup',
        detected_entities: entities,
        recommended_route: 'graph',
        confidence: entityScore,
        reasoning: `Query focuses on specific entities (${entities.map(e => e.name).join(', ')}). Direct graph lookup.`
      };
    } else {
      // No entities → Semantic/vector search
      return {
        intent: 'conceptual',
        detected_entities: [],
        recommended_route: 'vector',
        confidence: patterns.conceptualScore,
        reasoning: 'No specific entities detected. Conceptual query best served by semantic search.'
      };
    }
  }

  /**
   * Analyze query patterns for relationship and conceptual indicators
   * Uses regex patterns - lightweight and fast for keyword detection
   */
  private analyzePatterns(queryText: string): {
    isRelationship: boolean;
    isConceptual: boolean;
    relationshipScore: number;
    conceptualScore: number;
  } {
    const text = queryText.toLowerCase();

    // Relationship patterns
    const relationshipPatterns = [
      /\bhandles?\b/,
      /\bemits?\b/,
      /\bmentions?\b/,
      /\bkeeper\s+for\b/,
      /\bwhat\s+(does|do|is)\s+\w+\s+handle/,
      /\bwhich\s+keeper/,
      /\bmessages?\s+(for|handled\s+by)/,
      /\brelationship\s+between/,
      /\bconnected\s+to/,
      /\bdepend(s|ency|encies)\s+on/,
    ];

    // Conceptual patterns
    const conceptualPatterns = [
      /\bhow\s+(does|do|to)\b/,
      /\bwhy\s+(does|do|is)\b/,
      /\bexplain\b/,
      /\bguide\s+(to|for)\b/,
      /\boverview\s+of\b/,
      /\bgetting\s+started\b/,
      /\bwhat\s+is\s+the\s+(purpose|concept|idea)/,
      /\bunderstand(ing)?\b/,
      /\blearn(ing)?\s+about/,
      /\bintroduction\s+to/,
      /\bbest\s+practice/,
    ];

    const relationshipMatches = relationshipPatterns.filter(p => p.test(text)).length;
    const conceptualMatches = conceptualPatterns.filter(p => p.test(text)).length;

    return {
      isRelationship: relationshipMatches > 0,
      isConceptual: conceptualMatches > 0,
      relationshipScore: Math.min(relationshipMatches / 3, 1.0),
      conceptualScore: Math.min(conceptualMatches / 3, 1.0),
    };
  }

  /**
   * Calculate confidence score combining entity detection and pattern matching
   */
  private calculateConfidence(entityScore: number, patternScore: number): number {
    // Weighted average: entity detection 60%, pattern matching 40%
    return Math.min((entityScore * 0.6) + (patternScore * 0.4), 1.0);
  }

  /**
   * Get statistics about the entity lookup table
   */
  async getStats(): Promise<{ total: number; by_type: Record<string, number> }> {
    const query = `
      SELECT
        entity_type,
        COUNT(*) as count
      FROM entity_lookup
      GROUP BY entity_type
      ORDER BY entity_type
    `;

    const result = await this.pool.query(query);
    const by_type: Record<string, number> = {};
    let total = 0;

    result.rows.forEach(row => {
      by_type[row.entity_type] = parseInt(row.count);
      total += parseInt(row.count);
    });

    return { total, by_type };
  }

  /**
   * Test the similarity matching for a specific entity name
   * Useful for debugging and tuning the similarity threshold
   */
  async testSimilarity(entityName: string, queryText: string): Promise<number> {
    const query = `
      SELECT similarity($1, $2) as score
    `;

    const result = await this.pool.query(query, [entityName, queryText]);
    return result.rows[0]?.score || 0;
  }
}

/**
 * Create a default QueryRouter instance using environment variables
 */
export function createQueryRouter(): QueryRouter {
  return new QueryRouter({
    host: process.env.GRAPH_DB_HOST || 'localhost',
    port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
    database: process.env.GRAPH_DB_NAME || 'eliza',
    user: process.env.GRAPH_DB_USER,
    password: process.env.GRAPH_DB_PASSWORD,
    entitySimilarityThreshold: parseFloat(process.env.ENTITY_SIMILARITY_THRESHOLD || '0.15'),
  });
}
