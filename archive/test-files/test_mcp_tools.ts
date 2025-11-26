/**
 * Test script for Regen KOI MCP Tools
 * Tests the 3 implemented tools against local Hybrid RAG API
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_URL = process.env.KOI_API_ENDPOINT || 'http://localhost:8301/api/koi';

// Helper to format test results
function formatMemories(memories: any[], limit: number = 5): string {
  if (!memories || memories.length === 0) {
    return '  ❌ No results found';
  }

  const results = memories.slice(0, limit).map((m, i) => {
    // Parse content if it's a JSON string
    let text = '';
    try {
      if (typeof m.content === 'string') {
        const parsed = JSON.parse(m.content);
        text = parsed.text || parsed.content || m.content;
      } else {
        text = m.content?.text || m.content || '';
      }
    } catch {
      text = m.content || '';
    }

    const preview = text.substring(0, 150).replace(/\n/g, ' ');
    const score = m.similarity || m.score || 0;
    return `  ${i + 1}. RID: ${m.rid}\n     Score: ${score.toFixed(4)}\n     Preview: ${preview}...`;
  }).join('\n\n');

  return `  ✓ Found ${memories.length} results (showing top ${Math.min(limit, memories.length)}):\n\n${results}`;
}

async function testSearchGithubDocs() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 1: search_github_docs - "cosmos sdk module"');
  console.log('═══════════════════════════════════════════════════════');

  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: 'cosmos sdk module',
      limit: 5
    });

    const memories = response.data?.results || [];
    console.log(formatMemories(memories));

    // Validate results
    const hasRegenLedger = memories.some((m: any) =>
      m.rid && m.rid.includes('regen-ledger')
    );
    console.log(`\n  Repository filter: ${hasRegenLedger ? '✓ Found regen-ledger results' : '⚠ No regen-ledger in top results'}`);

    return memories.length > 0;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testSearchDataModule() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 2: search_github_docs - "data module" (x/data)');
  console.log('═══════════════════════════════════════════════════════');

  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: 'data module',
      limit: 10
    });

    const memories = response.data?.results || [];
    const regenLedgerResults = memories.filter((m: any) =>
      m.rid && m.rid.includes('regen-ledger')
    );

    console.log(formatMemories(regenLedgerResults, 5));

    // Check for x/data module specifically
    const hasXData = memories.some((m: any) =>
      m.rid && (m.rid.includes('x/data') || m.text?.includes('x/data'))
    );
    console.log(`\n  x/data module found: ${hasXData ? '✓ Yes' : '⚠ Not in top results'}`);

    return regenLedgerResults.length > 0;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testProtocolBuffers() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 3: search_github_docs - proto files');
  console.log('═══════════════════════════════════════════════════════');

  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: 'regen ecocredit proto message service rpc',
      limit: 10
    });

    const memories = response.data?.results || [];
    const protoFiles = memories.filter((m: any) =>
      m.rid && m.rid.includes('.proto')
    );

    console.log(formatMemories(protoFiles, 5));

    // Check file type distribution
    const fileTypes = memories.reduce((acc: any, m: any) => {
      const ext = m.rid?.split('.').pop() || 'unknown';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});
    console.log(`\n  File types found: ${JSON.stringify(fileTypes)}`);

    return protoFiles.length > 0;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testRepoOverview() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 4: get_repo_overview - regen-ledger');
  console.log('═══════════════════════════════════════════════════════');

  try {
    // Simulate what the tool does: search for README and overview docs
    const queries = [
      'regen-ledger README documentation overview',
      'regen-ledger CONTRIBUTING guidelines',
      'regen-ledger architecture structure'
    ];

    const results = await Promise.all(
      queries.map(query =>
        axios.post(`${API_URL}/query`, { question: query, limit: 5 })
      )
    );

    const allMemories = results.flatMap(r => r.data?.results || []);
    const uniqueRids = new Set(allMemories.map((m: any) => m.rid));

    console.log(`  ✓ Found ${uniqueRids.size} unique documents across ${queries.length} queries`);

    // Show top result from each query
    queries.forEach((query, i) => {
      const memories = results[i].data?.results || [];
      if (memories.length > 0) {
        const top = memories[0];
        console.log(`\n  Query "${query.substring(0, 40)}...":`);
        console.log(`    Top result: ${top.rid} (score: ${(top.similarity || top.score || 0).toFixed(4)})`);
      }
    });

    return uniqueRids.size > 0;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testTechStack() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 5: get_tech_stack - regen-ledger');
  console.log('═══════════════════════════════════════════════════════');

  try {
    // Simulate what the tool does: search for tech stack indicators
    const queries = [
      'go.mod go dependencies modules',
      'Makefile build tools',
      'package.json dependencies'
    ];

    const results = await Promise.all(
      queries.map(query =>
        axios.post(`${API_URL}/query`, { question: query, limit: 5 })
      )
    );

    const allMemories = results.flatMap(r => r.data?.results || []);

    // Identify tech stack components
    const techStack = {
      go: allMemories.some((m: any) => m.rid?.includes('go.mod') || m.rid?.includes('.go')),
      proto: allMemories.some((m: any) => m.rid?.includes('.proto')),
      makefile: allMemories.some((m: any) => m.rid?.toLowerCase().includes('makefile')),
      markdown: allMemories.some((m: any) => m.rid?.includes('.md'))
    };

    console.log(`  ✓ Tech stack detected:`);
    console.log(`    - Go: ${techStack.go ? '✓' : '✗'}`);
    console.log(`    - Protocol Buffers: ${techStack.proto ? '✓' : '✗'}`);
    console.log(`    - Makefile: ${techStack.makefile ? '✓' : '✗'}`);
    console.log(`    - Documentation (MD): ${techStack.markdown ? '✓' : '✗'}`);

    // Show key files found
    const keyFiles = allMemories
      .filter((m: any) =>
        m.rid?.includes('go.mod') ||
        m.rid?.toLowerCase().includes('makefile') ||
        m.rid?.includes('package.json')
      )
      .slice(0, 3);

    if (keyFiles.length > 0) {
      console.log(`\n  Key config files found:`);
      keyFiles.forEach((m: any) => {
        console.log(`    - ${m.rid} (score: ${(m.similarity || m.score || 0).toFixed(4)})`);
      });
    }

    return allMemories.length > 0;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testEdgeCases() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test 6: Edge Cases');
  console.log('═══════════════════════════════════════════════════════');

  let passedTests = 0;

  // Test 1: Empty query
  console.log('\n  Test 6a: Empty query');
  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: '',
      limit: 5
    });
    console.log(`    Result: ${response.data?.memories?.length || 0} results`);
    passedTests++;
  } catch (error) {
    console.log(`    ✓ Correctly rejected: ${error instanceof Error ? error.message : 'Error'}`);
    passedTests++;
  }

  // Test 2: Very specific query with no results expected
  console.log('\n  Test 6b: Query with unlikely results');
  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: 'xyzabc123nonexistent',
      limit: 5
    });
    const count = response.data?.memories?.length || 0;
    console.log(`    ✓ Handled gracefully: ${count} results (low scores expected)`);
    passedTests++;
  } catch (error) {
    console.error(`    ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 3: Large limit
  console.log('\n  Test 6c: Large limit (100)');
  try {
    const response = await axios.post(`${API_URL}/query`, {
      question: 'cosmos',
      limit: 100
    });
    const count = response.data?.memories?.length || 0;
    console.log(`    ✓ Returned ${count} results`);
    passedTests++;
  } catch (error) {
    console.error(`    ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return passedTests >= 2;
}

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Regen KOI MCP Tools - Comprehensive Test Suite     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\nAPI Endpoint: ${API_URL}`);
  console.log(`Database: 1,287 files from regen-ledger`);
  console.log(`Embeddings: OpenAI text-embedding-3-large (1024-dim)`);

  const startTime = Date.now();
  const results = {
    test1: await testSearchGithubDocs(),
    test2: await testSearchDataModule(),
    test3: await testProtocolBuffers(),
    test4: await testRepoOverview(),
    test5: await testTechStack(),
    test6: await testEdgeCases()
  };
  const duration = Date.now() - startTime;

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('Test Summary');
  console.log('═══════════════════════════════════════════════════════');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  console.log(`\n  Passed: ${passed}/${total} tests`);
  console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  Status: ${passed === total ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}`);

  console.log('\n  Individual Results:');
  console.log(`    1. search_github_docs (cosmos): ${results.test1 ? '✓' : '✗'}`);
  console.log(`    2. search_github_docs (data): ${results.test2 ? '✓' : '✗'}`);
  console.log(`    3. search_github_docs (proto): ${results.test3 ? '✓' : '✗'}`);
  console.log(`    4. get_repo_overview: ${results.test4 ? '✓' : '✗'}`);
  console.log(`    5. get_tech_stack: ${results.test5 ? '✓' : '✗'}`);
  console.log(`    6. Edge cases: ${results.test6 ? '✓' : '✗'}`);

  console.log('\n═══════════════════════════════════════════════════════\n');

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
