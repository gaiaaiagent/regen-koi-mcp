/**
 * Enhanced SPARQL client with focused predicate retrieval
 * Uses consolidated predicates and semantic search for better NL→SPARQL
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const JENA_ENDPOINT = process.env.JENA_ENDPOINT || 'http://localhost:3030/koi/sparql';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

// Load consolidated predicates and patterns
let PREDICATE_MAPPING: any = {};
let PREDICATE_PATTERNS: any[] = [];
let CONSOLIDATION_INFO: any = {};

// Load consolidation data
try {
  const consolidationPath = path.join(__dirname, '../../koi-processor/src/core/final_consolidation_all_t0.30.json');
  if (fs.existsSync(consolidationPath)) {
    const data = JSON.parse(fs.readFileSync(consolidationPath, 'utf-8'));
    PREDICATE_MAPPING = data.mapping || {};
    CONSOLIDATION_INFO = data.consolidation_info || {};
    console.log(`Loaded ${Object.keys(PREDICATE_MAPPING).length} predicate mappings`);
  }
} catch (error) {
  console.warn('Could not load predicate consolidation:', error);
}

// Load predicate patterns for better context
try {
  const patternsPath = path.join(__dirname, '../../koi-processor/src/core/predicate_patterns.json');
  if (fs.existsSync(patternsPath)) {
    PREDICATE_PATTERNS = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
    console.log(`Loaded ${PREDICATE_PATTERNS.length} predicate patterns`);
  }
} catch (error) {
  console.warn('Could not load predicate patterns:', error);
}

// Intent patterns for better query understanding
const INTENT_PATTERNS = {
  employment: ['work', 'employ', 'job', 'staff', 'hire', 'position'],
  creation: ['create', 'develop', 'build', 'make', 'produce', 'design', 'establish'],
  collaboration: ['partner', 'collaborate', 'cooperate', 'work with', 'team'],
  funding: ['fund', 'finance', 'sponsor', 'invest', 'support', 'back'],
  leadership: ['lead', 'direct', 'manage', 'head', 'oversee', 'run'],
  ownership: ['own', 'have', 'possess', 'control', 'hold'],
  focus: ['focus', 'aim', 'target', 'address', 'concentrate'],
  aggregation: ['how many', 'count', 'number', 'total', 'amount']
};

export class EnhancedSPARQLClient {
  private queryCache: Map<string, any> = new Map();

  /**
   * Detect intent from natural language query
   */
  private detectIntent(query: string): string {
    const queryLower = query.toLowerCase();

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(pattern => queryLower.includes(pattern))) {
        return intent;
      }
    }

    return 'general';
  }

  /**
   * Find relevant predicates for the query using patterns and intent
   */
  private findRelevantPredicates(query: string, intent: string, limit: number = 15): string[] {
    const queryLower = query.toLowerCase();
    const relevantPredicates = new Set<string>();

    // First, add predicates based on intent
    const intentPredicates = this.getIntentPredicates(intent);
    intentPredicates.forEach(pred => relevantPredicates.add(pred));

    // Then, find predicates that match query keywords
    for (const pattern of PREDICATE_PATTERNS.slice(0, 1000)) { // Check top 1000
      const predLower = pattern.predicate.toLowerCase();

      // Simple keyword matching (in production, use embeddings)
      const queryWords = queryLower.split(/\s+/);
      const predWords = predLower.split(/[\s_-]+/);

      const hasMatch = queryWords.some((qw: string) =>
        predWords.some((pw: string) => pw.includes(qw) || qw.includes(pw))
      );

      if (hasMatch) {
        relevantPredicates.add(pattern.predicate);

        // If this is a consolidated predicate, add its variants
        const consolidated = PREDICATE_MAPPING[pattern.predicate];
        if (consolidated && CONSOLIDATION_INFO[consolidated]) {
          const members = CONSOLIDATION_INFO[consolidated].members || [];
          members.slice(0, 5).forEach((m: string) => relevantPredicates.add(m));
        }
      }

      if (relevantPredicates.size >= limit) break;
    }

    return Array.from(relevantPredicates).slice(0, limit);
  }

  /**
   * Get predicates for specific intent
   */
  private getIntentPredicates(intent: string): string[] {
    const intentMappings: Record<string, string[]> = {
      employment: ['works for', 'employed by', 'works at', 'employee of', 'hired by'],
      creation: ['created', 'developed', 'built', 'made', 'produced', 'designed'],
      collaboration: ['partners with', 'collaborates with', 'works with', 'cooperates with'],
      funding: ['funds', 'finances', 'sponsors', 'invests in', 'supports', 'backs'],
      leadership: ['leads', 'directs', 'manages', 'heads', 'oversees', 'runs'],
      ownership: ['owns', 'has', 'possesses', 'controls', 'holds'],
      focus: ['focuses on', 'aims to', 'targets', 'addresses', 'concentrates on'],
      aggregation: ['has', 'includes', 'contains', 'comprises']
    };

    return intentMappings[intent] || [];
  }

  /**
   * Build focused schema context for LLM
   */
  private buildFocusedSchema(query: string, predicates: string[]): string {
    const intent = this.detectIntent(query);

    let schema = `# Focused Schema for Query\n\n`;
    schema += `## Query Intent: ${intent}\n\n`;

    schema += `## Entity Types\n`;
    schema += `- Text strings (subjects and objects are literals, not URIs)\n`;
    schema += `- Common patterns: Person names, Organization names, Project descriptions\n\n`;

    schema += `## Relevant Predicates (${predicates.length})\n`;

    // Group predicates by consolidated form
    const groups: Record<string, string[]> = {};

    for (const pred of predicates) {
      const consolidated = PREDICATE_MAPPING[pred] || pred;
      if (!groups[consolidated]) {
        groups[consolidated] = [];
      }
      if (!groups[consolidated].includes(pred)) {
        groups[consolidated].push(pred);
      }
    }

    // Show consolidated groups
    for (const [consolidated, variants] of Object.entries(groups).slice(0, 10)) {
      schema += `- **${consolidated}**`;
      if (variants.length > 1) {
        schema += ` (variants: ${variants.slice(0, 3).join(', ')}`;
        if (variants.length > 3) schema += `, +${variants.length - 3} more`;
        schema += ')';
      }
      schema += '\n';
    }

    schema += `\n## Query Structure\n`;
    schema += `Note: Subjects and objects are text literals, not entity URIs\n`;
    schema += `\`\`\`sparql\n`;
    schema += `PREFIX regx: <https://regen.network/ontology/experimental#>\n`;
    schema += `SELECT ?subject ?predicate ?object WHERE {\n`;
    schema += `  ?stmt a regx:Statement .\n`;
    schema += `  ?stmt regx:subject ?subject .\n`;
    schema += `  ?stmt regx:predicate ?predicate .\n`;
    schema += `  ?stmt regx:object ?object .\n`;
    schema += `  # Use FILTER with CONTAINS for text matching\n`;
    schema += `  # Use OR filters for predicate variants\n`;
    schema += `}\n`;
    schema += `\`\`\`\n`;

    return schema;
  }

  /**
   * Convert natural language to SPARQL using focused retrieval
   */
  async naturalLanguageToSparql(nlQuery: string, limit: number = 50): Promise<string> {
    // Check cache
    const cacheKey = createHash('md5').update(nlQuery).digest('hex');
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey);
    }

    // Detect intent
    const intent = this.detectIntent(nlQuery);

    // Find relevant predicates
    const relevantPredicates = this.findRelevantPredicates(nlQuery, intent);

    // Build focused schema
    const schema = this.buildFocusedSchema(nlQuery, relevantPredicates);

    // If no OpenAI key, generate template query
    if (!OPENAI_API_KEY) {
      return this.generateTemplateQuery(nlQuery, intent, relevantPredicates, limit);
    }

    try {
      // Generate SPARQL with focused context
      const prompt = `Convert this natural language query to SPARQL.

Natural Language Query: ${nlQuery}

${schema}

Instructions:
1. Use the exact predicate names from the schema above
2. Remember that subjects and objects are text strings, not URIs
3. Use FILTER with CONTAINS for text matching
4. Include LIMIT ${limit}
5. Return only the SPARQL query, no explanation

SPARQL Query:`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: GPT_MODEL,
          messages: [
            { role: 'system', content: 'You are a SPARQL query expert. Generate valid SPARQL queries based on the provided schema.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let sparql = response.data.choices[0].message.content.trim();

      // Clean up the response
      if (sparql.includes('```sparql')) {
        sparql = sparql.split('```sparql')[1].split('```')[0].trim();
      } else if (sparql.includes('```')) {
        sparql = sparql.split('```')[1].split('```')[0].trim();
      }

      // Cache the result
      this.queryCache.set(cacheKey, sparql);

      return sparql;
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      // Fallback to template
      return this.generateTemplateQuery(nlQuery, intent, relevantPredicates, limit);
    }
  }

  /**
   * Generate template SPARQL query without AI
   */
  private generateTemplateQuery(query: string, intent: string, predicates: string[], limit: number): string {
    const queryLower = query.toLowerCase();

    // Build predicate filter
    let predicateFilter = '';
    if (predicates.length > 0) {
      const predicateConditions = predicates
        .slice(0, 5)
        .map(p => `?predicate = "${p}"`)
        .join(' || ');
      predicateFilter = `FILTER(${predicateConditions})`;
    }

    // Extract potential entity names (capitalized words)
    const words = query.split(/\s+/);
    const entities = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);

    let entityFilter = '';
    if (entities.length > 0) {
      const entityPattern = entities.join('|').toLowerCase();
      entityFilter = `FILTER(CONTAINS(LCASE(?subject), "${entityPattern}") || CONTAINS(LCASE(?object), "${entityPattern}"))`;
    }

    // Generate query based on intent
    let sparql = `PREFIX regx: <https://regen.network/ontology/experimental#>\n\n`;

    if (intent === 'aggregation') {
      sparql += `SELECT (COUNT(DISTINCT ?subject) as ?count) WHERE {\n`;
    } else {
      sparql += `SELECT DISTINCT ?subject ?predicate ?object WHERE {\n`;
    }

    sparql += `  ?stmt a regx:Statement .\n`;
    sparql += `  ?stmt regx:subject ?subject .\n`;
    sparql += `  ?stmt regx:predicate ?predicate .\n`;
    sparql += `  ?stmt regx:object ?object .\n`;

    if (predicateFilter) {
      sparql += `  ${predicateFilter}\n`;
    }

    if (entityFilter) {
      sparql += `  ${entityFilter}\n`;
    }

    sparql += `}\n`;

    if (intent !== 'aggregation') {
      sparql += `LIMIT ${limit}`;
    }

    return sparql;
  }

  /**
   * Execute a SPARQL query against Apache Jena
   */
  async executeQuery(sparql: string): Promise<any> {
    try {
      const response = await axios.post(
        JENA_ENDPOINT,
        `query=${encodeURIComponent(sparql)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json'
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('SPARQL execution error:', error.response?.data || error.message);
      throw new Error(`SPARQL query failed: ${error.response?.data || error.message}`);
    }
  }

  /**
   * Format SPARQL results for display
   */
  formatResults(results: any, originalQuery: string): string {
    if (!results?.results?.bindings) {
      return 'No results found.';
    }

    const bindings = results.results.bindings;

    if (bindings.length === 0) {
      return 'No results found for your query.';
    }

    let formatted = `## Graph Query Results (${bindings.length} results)\n\n`;

    // Format based on result structure
    if (bindings[0].count) {
      // Aggregation result
      formatted += `**Count**: ${bindings[0].count.value}\n`;
    } else {
      // Triple results
      for (const binding of bindings.slice(0, 20)) {
        const subject = binding.subject?.value || '';
        const predicate = binding.predicate?.value || '';
        const object = binding.object?.value || '';

        // Truncate long values
        const subjShort = subject.length > 50 ? subject.substring(0, 50) + '...' : subject;
        const objShort = object.length > 100 ? object.substring(0, 100) + '...' : object;

        formatted += `- **${subjShort}** → *${predicate}* → ${objShort}\n`;
      }

      if (bindings.length > 20) {
        formatted += `\n... and ${bindings.length - 20} more results\n`;
      }
    }

    return formatted;
  }
}

// Export as default for compatibility
export { EnhancedSPARQLClient as SPARQLClient };