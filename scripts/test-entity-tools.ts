#!/usr/bin/env node
/**
 * Smoke test for entity resolution and graph context MCP tools
 *
 * Tests the following endpoints via the apiClient pattern:
 * - GET /entity/resolve
 * - GET /entity/neighborhood
 * - GET /entity/documents
 *
 * Usage:
 *   node scripts/test-entity-tools.js
 *   # or with tsx:
 *   npx tsx scripts/test-entity-tools.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment
dotenv.config();

const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';

// Create API client matching the MCP server pattern
const apiClient = axios.create({
  baseURL: KOI_API_ENDPOINT,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Test cases
interface TestCase {
  name: string;
  description: string;
  run: () => Promise<void>;
}

const tests: TestCase[] = [
  // Test 1: resolve_entity with simple label
  {
    name: 'resolve_entity - notion',
    description: 'Resolve "notion" to find Notion-related entities',
    run: async () => {
      const response = await apiClient.get('/entity/resolve', {
        params: { label: 'notion', limit: 5 }
      });
      console.log('  Candidates found:', response.data.candidates?.length || 0);
      response.data.candidates?.slice(0, 3).forEach((c: any) => {
        console.log(`    - ${c.label || c.name}: ${c.uri} (${c.type || 'unknown type'})`);
      });
    }
  },

  // Test 2: resolve_entity with type_hint
  {
    name: 'resolve_entity - ethereum with TECHNOLOGY type_hint',
    description: 'Resolve "ethereum" with type_hint=TECHNOLOGY',
    run: async () => {
      const response = await apiClient.get('/entity/resolve', {
        params: { label: 'ethereum', type_hint: 'TECHNOLOGY', limit: 5 }
      });
      console.log('  Candidates found:', response.data.candidates?.length || 0);
      response.data.candidates?.slice(0, 3).forEach((c: any) => {
        console.log(`    - ${c.label || c.name}: ${c.type || 'unknown type'}`);
      });
    }
  },

  // Test 3: resolve_entity with ambiguous label
  {
    name: 'resolve_entity - regen commons (ambiguous)',
    description: 'Resolve "regen commons" - may match multiple entities',
    run: async () => {
      const response = await apiClient.get('/entity/resolve', {
        params: { label: 'regen commons', limit: 5 }
      });
      console.log('  Candidates found:', response.data.candidates?.length || 0);
      response.data.candidates?.forEach((c: any) => {
        console.log(`    - ${c.label || c.name}: ${c.type || 'unknown'} (confidence: ${c.confidence || 'N/A'})`);
      });
    }
  },

  // Test 4: get_entity_neighborhood by label
  {
    name: 'get_entity_neighborhood - by label',
    description: 'Get neighborhood for "ethereum" by label',
    run: async () => {
      const response = await apiClient.get('/entity/neighborhood', {
        params: { label: 'ethereum', direction: 'both', limit: 10 }
      });
      const data = response.data;
      console.log('  Entity:', data.entity?.label || data.entity?.uri || 'not found');
      console.log('  Edges:', data.edges?.length || 0);
      console.log('  Neighbors:', data.neighbors?.length || 0);
      if (data.edges?.length > 0) {
        console.log('  Sample edges:');
        data.edges.slice(0, 3).forEach((e: any) => {
          console.log(`    - ${e.predicate || e.relationship}: ${e.target_label || e.target}`);
        });
      }
    }
  },

  // Test 5: get_entity_neighborhood with direction filter
  {
    name: 'get_entity_neighborhood - outgoing only',
    description: 'Get only outgoing edges for "regen network"',
    run: async () => {
      const response = await apiClient.get('/entity/neighborhood', {
        params: { label: 'regen network', direction: 'out', limit: 10 }
      });
      const data = response.data;
      console.log('  Entity:', data.entity?.label || 'not found');
      console.log('  Outgoing edges:', data.edges?.length || 0);
    }
  },

  // Test 6: get_entity_documents - public only (no auth)
  {
    name: 'get_entity_documents - public (unauthenticated)',
    description: 'Get public documents for "ethereum" without auth token',
    run: async () => {
      const response = await apiClient.get('/entity/documents', {
        params: { label: 'ethereum', limit: 5 }
      });
      const data = response.data;
      console.log('  Entity:', data.entity?.label || 'not found');
      console.log('  Documents:', data.documents?.length || 0);
      if (data.documents?.length > 0) {
        console.log('  Sample documents:');
        data.documents.slice(0, 3).forEach((doc: any) => {
          console.log(`    - ${doc.title || doc.rid?.split('/').pop() || 'untitled'} (${doc.source || 'unknown source'})`);
        });
      }
    }
  },

  // Test 7: Error handling - missing params
  {
    name: 'get_entity_neighborhood - missing params (should fail gracefully)',
    description: 'Test error handling when no label or uri provided',
    run: async () => {
      try {
        await apiClient.get('/entity/neighborhood', {
          params: { direction: 'both', limit: 5 }
        });
        console.log('  Unexpected: Request succeeded without label/uri');
      } catch (error: any) {
        if (error.response) {
          console.log(`  Expected error: ${error.response.status} - ${error.response.data?.error || error.message}`);
        } else {
          console.log(`  Network error: ${error.message}`);
        }
      }
    }
  }
];

// Main runner
async function runTests() {
  console.log('='.repeat(60));
  console.log('KOI Entity Tools Smoke Test');
  console.log(`API Endpoint: ${KOI_API_ENDPOINT}`);
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`[TEST] ${test.name}`);
    console.log(`       ${test.description}`);

    try {
      await test.run();
      console.log('  [PASS]');
      passed++;
    } catch (error: any) {
      console.log(`  [FAIL] ${error.response?.data?.error || error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(console.error);
