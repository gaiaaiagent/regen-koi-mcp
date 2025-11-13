/**
 * True Hybrid Search Client
 * Combines SPARQL knowledge graph queries with vector similarity search
 */
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const JENA_ENDPOINT = process.env.JENA_ENDPOINT || 'http://localhost:3030/koi/sparql';
// Prefer KOI API if available; fallback to legacy 8910
const VECTOR_API_URL =
  process.env.API_URL ||
  process.env.KOI_API_ENDPOINT ||
  'https://regen.gaiaai.xyz/api/koi';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface SPARQLResult {
  subject: string;
  predicate: string;
  object: string;
  score?: number;
}

interface VectorResult {
  content: string;
  metadata: any;
  score: number;
  rid?: string;
}

interface HybridResult {
  type: 'sparql' | 'vector' | 'both';
  content: string;
  metadata: any;
  score: number;
  sparqlTriple?: SPARQLResult;
  vectorMatch?: VectorResult;
}

export class HybridSearchClient {
  /**
   * Execute SPARQL query
   */
  async querySPARQL(query: string, filters?: any): Promise<SPARQLResult[]> {
    try {
      // Build SPARQL query based on natural language
      const sparql = await this.buildSPARQLQuery(query, { dateRange: filters?.date_range, includeUndated: !!filters?.include_undated });

      const response = await axios.post(
        JENA_ENDPOINT,
        `query=${encodeURIComponent(sparql)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json'
          },
          auth: {
            username: 'admin',
            password: 'admin'
          }
        }
      );

      const data: any = response.data as any;
      const bindings = data?.results?.bindings || [];
      return bindings.map((b: any) => ({
        subject: b.subject?.value || '',
        predicate: b.predicate?.value || '',
        object: b.object?.value || '',
        score: 1.0 // SPARQL results get high confidence
      }));
    } catch (error) {
      console.error('SPARQL query failed:', error);
      return [];
    }
  }

  /**
   * Execute vector similarity search
   */
  async queryVector(query: string, limit: number = 10, filters?: any): Promise<VectorResult[]> {
    try {
      const body: any = { query: query, limit, include_metadata: true };
      if (filters && Object.keys(filters).length > 0) body.filters = filters;
      const response = await axios.post(`${VECTOR_API_URL}/query`, body);

      const data: any = response.data as any;
      const results = data?.results || [];
      return results.map((r: any) => ({
        content: r.content || r.text || '',
        metadata: r.metadata || {},
        score: r.score || 0,
        rid: r.rid
      }));
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  /**
   * True hybrid search - parallel execution
   */
  async hybridSearch(query: string, options: {
    sparqlLimit?: number;
    vectorLimit?: number;
    fusionStrategy?: 'rrf' | 'weighted' | 'interleave';
    filters?: any;
  } = {}): Promise<HybridResult[]> {
    const {
      sparqlLimit = 20,
      vectorLimit = 10,
      fusionStrategy = 'rrf',
      filters
    } = options;

    console.log(`🔍 Hybrid search for: "${query}"`);

    // Execute both queries in parallel
    const [sparqlResults, vectorResults] = await Promise.all([
      this.querySPARQL(query, filters),
      this.queryVector(query, vectorLimit, filters)
    ]);

    console.log(`  SPARQL: ${sparqlResults.length} results`);
    console.log(`  Vector: ${vectorResults.length} results`);

    // Fuse results based on strategy
    let fusedResults: HybridResult[];

    switch (fusionStrategy) {
      case 'rrf':
        fusedResults = this.reciprocalRankFusion(sparqlResults, vectorResults);
        break;
      case 'weighted':
        fusedResults = this.weightedFusion(sparqlResults, vectorResults, 0.6, 0.4);
        break;
      case 'interleave':
        fusedResults = this.interleaveFusion(sparqlResults, vectorResults);
        break;
      default:
        fusedResults = this.reciprocalRankFusion(sparqlResults, vectorResults);
    }

    return fusedResults.slice(0, Math.max(sparqlLimit, vectorLimit));
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   */
  private reciprocalRankFusion(
    sparqlResults: SPARQLResult[],
    vectorResults: VectorResult[]
  ): HybridResult[] {
    const k = 60; // RRF constant
    const scoreMap = new Map<string, HybridResult>();

    // Process SPARQL results
    sparqlResults.forEach((result, rank) => {
      const key = `${result.subject}-${result.predicate}-${result.object}`;
      const rrfScore = 1 / (k + rank + 1);

      scoreMap.set(key, {
        type: 'sparql',
        content: `${result.subject} ${result.predicate} ${result.object}`,
        metadata: { source: 'sparql' },
        score: rrfScore,
        sparqlTriple: result
      });
    });

    // Process vector results
    vectorResults.forEach((result, rank) => {
      const key = result.rid || result.content.substring(0, 100);
      const rrfScore = 1 / (k + rank + 1);

      const existing = scoreMap.get(key);
      if (existing) {
        // Combine scores if found in both
        existing.score += rrfScore;
        existing.type = 'both';
        existing.vectorMatch = result;
      } else {
        scoreMap.set(key, {
          type: 'vector',
          content: result.content,
          metadata: { ...result.metadata, source: 'vector' },
          score: rrfScore,
          vectorMatch: result
        });
      }
    });

    // Sort by combined score
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Weighted score fusion
   */
  private weightedFusion(
    sparqlResults: SPARQLResult[],
    vectorResults: VectorResult[],
    sparqlWeight: number,
    vectorWeight: number
  ): HybridResult[] {
    const results: HybridResult[] = [];

    // Add SPARQL results with weight
    sparqlResults.forEach(result => {
      results.push({
        type: 'sparql',
        content: `${result.subject} ${result.predicate} ${result.object}`,
        metadata: { source: 'sparql' },
        score: (result.score || 1.0) * sparqlWeight,
        sparqlTriple: result
      });
    });

    // Add vector results with weight
    vectorResults.forEach(result => {
      results.push({
        type: 'vector',
        content: result.content,
        metadata: { ...result.metadata, source: 'vector' },
        score: result.score * vectorWeight,
        vectorMatch: result
      });
    });

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Interleave results from both sources
   */
  private interleaveFusion(
    sparqlResults: SPARQLResult[],
    vectorResults: VectorResult[]
  ): HybridResult[] {
    const results: HybridResult[] = [];
    const maxLen = Math.max(sparqlResults.length, vectorResults.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < sparqlResults.length) {
        const result = sparqlResults[i];
        results.push({
          type: 'sparql',
          content: `${result.subject} ${result.predicate} ${result.object}`,
          metadata: { source: 'sparql' },
          score: 1.0 - (i / sparqlResults.length) * 0.5,
          sparqlTriple: result
        });
      }

      if (i < vectorResults.length) {
        const result = vectorResults[i];
        results.push({
          type: 'vector',
          content: result.content,
          metadata: { ...result.metadata, source: 'vector' },
          score: result.score,
          vectorMatch: result
        });
      }
    }

    return results;
  }

  /**
   * Build SPARQL query from natural language
   */
  private async buildSPARQLQuery(nlQuery: string, options?: { dateRange?: { start?: string; end?: string }, includeUndated?: boolean }): Promise<string> {
    // Use the refined graph structure
    const queryLower = nlQuery.toLowerCase();

    // Simple pattern matching for now
    if (queryLower.includes('count') || queryLower.includes('how many')) {
      return `
        PREFIX regx: <https://regen.network/ontology/experimental#>
        SELECT (COUNT(DISTINCT ?subject) as ?count)
        WHERE {
          ?stmt a regx:Statement .
          ?stmt regx:subject ?subject .
          ?stmt regx:predicate ?predicate .
          ?stmt regx:object ?object .
        }
      `;
    }

    // Default: return triples matching keywords
    const keywords = nlQuery.split(/\s+/)
      .filter(w => w.length > 3)
      .map(w => w.toLowerCase());

    const dateFilter = options?.dateRange;
    const includeUndated = !!options?.includeUndated;
    const dateClause = dateFilter ? `
        OPTIONAL { ?stmt regx:publishedAt ?publishedAt . }
        FILTER(BOUND(?publishedAt) ${includeUndated ? '|| !BOUND(?publishedAt)' : ''}
          ${dateFilter.start ? `&& ?publishedAt >= \"${dateFilter.start}T00:00:00Z\"^^xsd:dateTime` : ''}
          ${dateFilter.end ? `&& ?publishedAt <= \"${dateFilter.end}T23:59:59Z\"^^xsd:dateTime` : ''}
        )
    ` : '';

    return `
      PREFIX regx: <https://regen.network/ontology/experimental#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      SELECT ?subject ?predicate ?object
      WHERE {
        ?stmt a regx:Statement .
        ?stmt regx:subject ?subject .
        ?stmt regx:predicate ?predicate .
        ?stmt regx:object ?object .
        ${dateClause}
        FILTER(
          ${keywords.map(kw => `
            regex(str(?subject), \"${kw}\", \"i\") ||
            regex(str(?predicate), \"${kw}\", \"i\") ||
            regex(str(?object), \"${kw}\", \"i\")
          `).join(' || ')}
        )
      }
      LIMIT 20
    `;
  }

  /**
   * Format results for display
   */
  formatResults(results: HybridResult[]): string {
    let output = '# Hybrid Search Results\n\n';

    const grouped = {
      both: results.filter(r => r.type === 'both'),
      sparql: results.filter(r => r.type === 'sparql'),
      vector: results.filter(r => r.type === 'vector')
    };

    // When nothing is returned from either branch, make it explicit
    if (
      grouped.both.length === 0 &&
      grouped.sparql.length === 0 &&
      grouped.vector.length === 0
    ) {
      output += 'No results found. The KOI API or graph may be unreachable, or the knowledge base did not match this query.\n';
      return output;
    }

    if (grouped.both.length > 0) {
      output += '## 🔗 Found in Both Sources\n';
      grouped.both.forEach((r, i) => {
        output += `${i + 1}. **Score: ${r.score.toFixed(3)}**\n`;
        output += `   ${r.content.substring(0, 200)}...\n\n`;
      });
    }

    if (grouped.sparql.length > 0) {
      output += '## 📊 Knowledge Graph Results\n';
      grouped.sparql.slice(0, 5).forEach((r, i) => {
        if (r.sparqlTriple) {
          output += `${i + 1}. ${r.sparqlTriple.subject} → ${r.sparqlTriple.predicate} → ${r.sparqlTriple.object}\n`;
        }
      });
      output += '\n';
    }

    if (grouped.vector.length > 0) {
      output += '## 🔍 Vector Search Results\n';
      grouped.vector.slice(0, 5).forEach((r, i) => {
        output += `${i + 1}. ${r.content.substring(0, 150)}...\n`;
        if (r.vectorMatch?.rid) {
          output += `   RID: ${r.vectorMatch.rid}\n`;
        }
        const pub = r.vectorMatch?.metadata?.published_at;
        if (pub) {
          output += `   Published: ${pub}\n`;
        }
      });
    }

    return output;
  }
}

// Export for use in main index.ts
export default HybridSearchClient;
