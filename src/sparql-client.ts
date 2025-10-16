/**
 * SPARQL client for Apache Jena integration
 * Handles graph queries and natural language to SPARQL conversion
 */

import axios from 'axios';

// Configuration
const JENA_ENDPOINT = process.env.JENA_ENDPOINT || 'http://localhost:3030/koi/sparql';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

// Ontology context for the Regen Network graph
const ONTOLOGY_CONTEXT = `
# Regen Network Knowledge Graph Ontology

## Namespaces
- regen: <https://regen.network/ontology/experimental#>
- prov: <http://www.w3.org/ns/prov#>
- schema: <http://schema.org/>
- rdfs: <http://www.w3.org/2000/01/rdf-schema#>

## Core Classes
- regen:Statement - A statement/claim extracted from documents
- schema:Organization - An organization entity
- schema:Project - A project entity
- schema:Person - A person entity
- prov:Entity - A provenance entity

## Core Properties
- regen:subject - Subject of a statement
- regen:predicate - Predicate/relation in a statement
- regen:object - Object of a statement
- regen:confidence - Confidence score (0.0-1.0)
- regen:entityType - Type of entity
- rdfs:label - Human-readable label
`;

const EXAMPLE_QUERIES = `
## Example Natural Language to SPARQL:

1. "Find all organizations"
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?org ?label WHERE {
  ?org a schema:Organization .
  OPTIONAL { ?org rdfs:label ?label }
} LIMIT 100

2. "Show statements about Regen Network"
PREFIX regen: <https://regen.network/ontology/experimental#>
SELECT ?stmt ?predicate ?object WHERE {
  ?stmt regen:subject ?subject .
  ?stmt regen:predicate ?predicate .
  ?stmt regen:object ?object .
  FILTER(CONTAINS(LCASE(STR(?subject)), "regen network"))
} LIMIT 50

3. "Find high-confidence relationships"
PREFIX regen: <https://regen.network/ontology/experimental#>
SELECT ?subject ?predicate ?object ?confidence WHERE {
  ?stmt regen:subject ?subject .
  ?stmt regen:predicate ?predicate .
  ?stmt regen:object ?object .
  ?stmt regen:confidence ?confidence .
  FILTER(?confidence > 0.8)
} ORDER BY DESC(?confidence) LIMIT 100
`;

export class SPARQLClient {
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
   * Convert natural language to SPARQL using GPT
   */
  async naturalLanguageToSparql(nlQuery: string, limit: number = 50): Promise<string> {
    // If no OpenAI key, use fallback keyword search
    if (!OPENAI_API_KEY) {
      console.warn('No OpenAI API key configured, using fallback keyword search');
      return this.createKeywordSparql(nlQuery, limit);
    }

    const prompt = `Convert this natural language query to a SPARQL query for the Regen Network knowledge graph.

${ONTOLOGY_CONTEXT}

${EXAMPLE_QUERIES}

Natural Language Query: "${nlQuery}"

Important:
- Use appropriate prefixes
- Include LIMIT ${limit} at the end
- Return ONLY the SPARQL query, no explanation

SPARQL Query:`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: GPT_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a SPARQL query expert. Convert natural language to valid SPARQL queries.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
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

      // Clean up the SPARQL query
      if (sparql.startsWith('```sparql')) {
        sparql = sparql.substring(9);
      }
      if (sparql.startsWith('```')) {
        sparql = sparql.substring(3);
      }
      if (sparql.endsWith('```')) {
        sparql = sparql.substring(0, sparql.length - 3);
      }

      return sparql.trim();
    } catch (error: any) {
      console.error('Error converting to SPARQL:', error.response?.data || error.message);
      return this.createKeywordSparql(nlQuery, limit);
    }
  }

  /**
   * Create a basic keyword search SPARQL query as fallback
   */
  createKeywordSparql(keywords: string, limit: number = 50): string {
    const keywordsLower = keywords.toLowerCase();

    return `
PREFIX regen: <https://regen.network/ontology/experimental#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT DISTINCT ?subject ?predicate ?object ?label ?confidence WHERE {
  {
    ?stmt regen:subject ?subject .
    ?stmt regen:predicate ?predicate .
    ?stmt regen:object ?object .
    OPTIONAL { ?stmt regen:confidence ?confidence }
    OPTIONAL { ?subject rdfs:label ?label }
    FILTER(
      CONTAINS(LCASE(STR(?subject)), "${keywordsLower}") ||
      CONTAINS(LCASE(STR(?object)), "${keywordsLower}") ||
      CONTAINS(LCASE(STR(?label)), "${keywordsLower}")
    )
  } UNION {
    ?entity rdfs:label ?label .
    BIND(?entity as ?subject)
    BIND("has_label" as ?predicate)
    BIND(?label as ?object)
    FILTER(CONTAINS(LCASE(?label), "${keywordsLower}"))
  }
}
LIMIT ${limit}
`;
  }

  /**
   * Format SPARQL results for display
   */
  formatResults(results: any, query: string): string {
    if (!results.results?.bindings) {
      return 'No results found';
    }

    const bindings = results.results.bindings;

    if (bindings.length === 0) {
      return 'No results found';
    }

    let formatted = `## Graph Query Results (${bindings.length} results)\n\n`;

    // Get column names from the first result
    const columns = results.head.vars || Object.keys(bindings[0]);
    formatted += `**Columns:** ${columns.join(', ')}\n\n`;

    // Format each result
    bindings.slice(0, 20).forEach((binding: any, index: number) => {
      formatted += `### Result ${index + 1}\n`;
      columns.forEach((col: string) => {
        if (binding[col]) {
          let value = binding[col].value;
          // Truncate long values
          if (value.length > 200) {
            value = value.substring(0, 197) + '...';
          }
          // Extract readable part from URIs
          if (binding[col].type === 'uri') {
            const readable = value.split('/').pop()?.split('#').pop() || value;
            formatted += `- **${col}**: ${readable} (${value})\n`;
          } else {
            formatted += `- **${col}**: ${value}\n`;
          }
        }
      });
      formatted += '\n';
    });

    if (bindings.length > 20) {
      formatted += `\n... and ${bindings.length - 20} more results\n`;
    }

    formatted += `\n**Query:** "${query}"`;

    return formatted;
  }

  /**
   * Get ontology statistics from the graph
   */
  async getOntologyStats(): Promise<any> {
    const queries = {
      total_triples: 'SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }',
      total_entities: `
        PREFIX schema: <http://schema.org/>
        SELECT (COUNT(DISTINCT ?entity) as ?count) WHERE {
          { ?entity a schema:Organization } UNION
          { ?entity a schema:Project } UNION
          { ?entity a schema:Person }
        }
      `,
      total_statements: `
        PREFIX regen: <https://regen.network/ontology/experimental#>
        SELECT (COUNT(?stmt) as ?count) WHERE {
          ?stmt a regen:Statement
        }
      `
    };

    const stats: any = {};

    for (const [key, query] of Object.entries(queries)) {
      try {
        const result = await this.executeQuery(query);
        if (result.results?.bindings?.[0]?.count) {
          stats[key] = parseInt(result.results.bindings[0].count.value);
        }
      } catch (error) {
        console.error(`Failed to get ${key}:`, error);
        stats[key] = 0;
      }
    }

    return stats;
  }
}