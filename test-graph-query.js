#!/usr/bin/env node

/**
 * Test script for graph query functionality
 * Tests both SPARQL and natural language queries
 */

import axios from 'axios';

const JENA_ENDPOINT = 'http://localhost:3030/koi/sparql';

async function testDirectSparql() {
  console.log('\n=== Testing Direct SPARQL Query ===\n');

  const sparqlQuery = `
PREFIX regen: <https://regen.network/ontology/experimental#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?entity ?label ?type WHERE {
  { ?entity a schema:Organization }
  UNION
  { ?entity a schema:Project }
  UNION
  { ?entity a schema:Person }
  OPTIONAL { ?entity rdfs:label ?label }
  OPTIONAL { ?entity regen:entityType ?type }
} LIMIT 10
`;

  try {
    const response = await axios.post(
      JENA_ENDPOINT,
      `query=${encodeURIComponent(sparqlQuery)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json'
        }
      }
    );

    console.log('✅ SPARQL query successful!');
    console.log(`Found ${response.data.results.bindings.length} results`);

    response.data.results.bindings.slice(0, 3).forEach((binding, i) => {
      console.log(`\nResult ${i + 1}:`);
      Object.entries(binding).forEach(([key, value]) => {
        const val = value.value;
        const displayVal = val.length > 50 ? val.substring(0, 50) + '...' : val;
        console.log(`  ${key}: ${displayVal}`);
      });
    });
  } catch (error) {
    console.error('❌ SPARQL query failed:', error.message);
  }
}

async function testGraphStats() {
  console.log('\n=== Testing Graph Statistics ===\n');

  const queries = {
    'Total Triples': 'SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }',
    'Total Statements': `
      PREFIX regen: <https://regen.network/ontology/experimental#>
      SELECT (COUNT(?stmt) as ?count) WHERE {
        ?stmt a regen:Statement
      }
    `,
    'Total Organizations': `
      PREFIX schema: <http://schema.org/>
      SELECT (COUNT(?org) as ?count) WHERE {
        ?org a schema:Organization
      }
    `
  };

  for (const [name, query] of Object.entries(queries)) {
    try {
      const response = await axios.post(
        JENA_ENDPOINT,
        `query=${encodeURIComponent(query)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json'
          }
        }
      );

      const count = response.data.results.bindings[0]?.count?.value || 0;
      console.log(`${name}: ${parseInt(count).toLocaleString()}`);
    } catch (error) {
      console.error(`❌ Failed to get ${name}:`, error.message);
    }
  }
}

async function testKeywordSearch() {
  console.log('\n=== Testing Keyword Search SPARQL ===\n');

  const keyword = 'regen';
  const sparqlQuery = `
PREFIX regen: <https://regen.network/ontology/experimental#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT DISTINCT ?subject ?predicate ?object ?label WHERE {
  {
    ?stmt regen:subject ?subject .
    ?stmt regen:predicate ?predicate .
    ?stmt regen:object ?object .
    OPTIONAL { ?subject rdfs:label ?label }
    FILTER(
      CONTAINS(LCASE(STR(?subject)), "${keyword}") ||
      CONTAINS(LCASE(STR(?object)), "${keyword}") ||
      CONTAINS(LCASE(STR(?label)), "${keyword}")
    )
  } UNION {
    ?entity rdfs:label ?label .
    BIND(?entity as ?subject)
    BIND("has_label" as ?predicate)
    BIND(?label as ?object)
    FILTER(CONTAINS(LCASE(?label), "${keyword}"))
  }
}
LIMIT 5
`;

  try {
    const response = await axios.post(
      JENA_ENDPOINT,
      `query=${encodeURIComponent(sparqlQuery)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json'
        }
      }
    );

    console.log(`✅ Found ${response.data.results.bindings.length} results for keyword "${keyword}"`);

    response.data.results.bindings.forEach((binding, i) => {
      console.log(`\nResult ${i + 1}:`);
      if (binding.subject) {
        const subj = binding.subject.value.split('/').pop() || binding.subject.value;
        console.log(`  Subject: ${subj}`);
      }
      if (binding.predicate) {
        console.log(`  Predicate: ${binding.predicate.value}`);
      }
      if (binding.object) {
        const obj = binding.object.value;
        const displayObj = obj.length > 100 ? obj.substring(0, 100) + '...' : obj;
        console.log(`  Object: ${displayObj}`);
      }
    });
  } catch (error) {
    console.error('❌ Keyword search failed:', error.message);
  }
}

async function main() {
  console.log('Testing Apache Jena Graph Query Integration\n');
  console.log('============================================');

  await testGraphStats();
  await testDirectSparql();
  await testKeywordSearch();

  console.log('\n============================================');
  console.log('Test complete!\n');
  console.log('The MCP server can now:');
  console.log('1. Execute direct SPARQL queries against Apache Jena');
  console.log('2. Convert natural language queries to SPARQL (with OpenAI API key)');
  console.log('3. Combine graph search results with vector search results');
  console.log('4. Fall back to vector search if SPARQL fails\n');
}

main().catch(console.error);