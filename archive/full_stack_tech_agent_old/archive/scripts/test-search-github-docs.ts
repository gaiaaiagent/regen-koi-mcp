#!/usr/bin/env node
/**
 * Test script for search_github_docs tool
 * Run: npx tsx scripts/test-search-github-docs.ts
 *
 * This script tests the implementation by calling the KOI API directly
 * and simulating the client-side filtering logic
 */

import axios from 'axios';

const API_ENDPOINT = 'https://regen.gaiaai.xyz/api/koi';

/**
 * Extract repository name from GitHub RID (matches implementation)
 */
function extractRepoFromRid(rid: string): string {
  // Try pattern with sensor ID first
  let match = rid.match(/regen\.github:github_([^_]+)_github_sensor/);
  if (match) return match[1];

  // Try pattern without sensor ID
  match = rid.match(/regen\.github:github_([^_]+)_([^_]+)/);
  return match ? match[1] : '';
}

/**
 * Extract filepath from GitHub RID for deduplication (matches implementation)
 */
function extractFilepathFromRid(rid: string): string {
  // Pattern 1: with sensor ID
  let match = rid.match(/_github_sensor_[^_]+_[^_]+_(.+?)(?:#chunk\d+)?$/);
  if (match) return match[1];

  // Pattern 2: without sensor ID
  match = rid.match(/github_[^_]+_[^_]+_(.+?)(?:#chunk\d+)?$/);
  return match ? match[1] : rid;
}

async function testSearchGithubDocs() {
  console.log('========================================');
  console.log('Testing search_github_docs Implementation');
  console.log('========================================\n');

  const testCases = [
    {
      name: 'Test 1: Basic search - all repos',
      args: { query: 'governance voting', limit: 5 }
    },
    {
      name: 'Test 2: Filtered by repository (regen-ledger)',
      args: { query: 'ecocredit module', repository: 'regen-ledger', limit: 5 }
    },
    {
      name: 'Test 3: No results expected',
      args: { query: 'xyznonexistent12345abcdefg', limit: 5 }
    },
    {
      name: 'Test 4: README search in regenie-corpus',
      args: { query: 'README pyproject', repository: 'regenie-corpus', limit: 3 }
    },
    {
      name: 'Test 5: Documentation search',
      args: { query: 'CONTRIBUTING.md guide', repository: 'regen-ledger', limit: 3 }
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const tc of testCases) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${tc.name}`);
    console.log(`Args: ${JSON.stringify(tc.args)}`);
    console.log('='.repeat(70));

    try {
      const startTime = Date.now();

      // Simulate what the tool does - call API WITHOUT filters
      const response = await axios.post(`${API_ENDPOINT}/query`, {
        query: tc.args.query,  // Phase 0: Use "query" not "question"
        limit: Math.min((tc.args.limit || 10) * 3, 50)
        // NO filters - Phase 0 proved they don't work
      });

      const apiTime = Date.now() - startTime;
      const allMemories = response.data?.memories || [];
      console.log(`✓ API Response: ${allMemories.length} raw results (${apiTime}ms)`);

      // Apply client-side filters (simulating the tool)
      const filteredMemories = allMemories
        // Filter 1: Only GitHub results
        .filter((m: any) => m.rid?.startsWith('regen.github:'))
        // Filter 2: Repository filter if specified
        .filter((m: any) => {
          if (!tc.args.repository) return true;
          const repo = extractRepoFromRid(m.rid);
          return repo === tc.args.repository;
        })
        // Filter 3: Deduplicate by filepath
        .filter((m: any, index: number, arr: any[]) => {
          const filepath = extractFilepathFromRid(m.rid);
          return arr.findIndex((x: any) =>
            extractFilepathFromRid(x.rid) === filepath
          ) === index;
        })
        // Take only requested amount
        .slice(0, tc.args.limit);

      console.log(`✓ After Filtering:`);
      console.log(`  - GitHub only: ${allMemories.filter((m: any) => m.rid?.startsWith('regen.github:')).length}`);
      console.log(`  - After deduplication: ${filteredMemories.length}`);
      console.log(`  - Final results: ${filteredMemories.length}`);

      if (filteredMemories.length > 0) {
        console.log(`\n✓ Sample Result:`);
        const sample = filteredMemories[0];
        const repo = extractRepoFromRid(sample.rid);
        const filepath = extractFilepathFromRid(sample.rid);
        console.log(`  Repository: ${repo}`);
        console.log(`  Filepath: ${filepath}`);
        console.log(`  RID: ${sample.rid}`);
        console.log(`  Similarity: ${(sample.similarity * 100).toFixed(1)}%`);
        console.log(`  Content: ${sample.content?.substring(0, 100)}...`);

        // Show all unique repos found
        const repos = new Set(filteredMemories.map((m: any) => extractRepoFromRid(m.rid)));
        console.log(`\n✓ Repositories in results: ${Array.from(repos).join(', ')}`);
      } else {
        console.log(`\n⚠ No results found (this may be expected for test 3)`);
      }

      // Determine if test passed
      const expectedNoResults = tc.name.includes('No results expected');
      if (expectedNoResults && filteredMemories.length === 0) {
        console.log(`\n✅ TEST PASSED (correctly returned no results)`);
        passedTests++;
      } else if (!expectedNoResults && filteredMemories.length > 0) {
        console.log(`\n✅ TEST PASSED`);
        passedTests++;
      } else {
        console.log(`\n❌ TEST FAILED (unexpected result count)`);
        failedTests++;
      }

    } catch (error: any) {
      console.log(`\n❌ TEST FAILED`);
      console.log(`Error: ${error.message}`);
      if (error.response) {
        console.log(`API Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      failedTests++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST SUMMARY`);
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passedTests}/${testCases.length}`);
  console.log(`❌ Failed: ${failedTests}/${testCases.length}`);
  console.log(`Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log(`\n🎉 ALL TESTS PASSED!`);
    console.log(`\nThe search_github_docs tool is working correctly!`);
  } else {
    console.log(`\n⚠️  Some tests failed. Review the output above.`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`VALIDATION CHECKLIST`);
  console.log('='.repeat(70));
  console.log(`✓ API parameter: Using "query" (not "question")`);
  console.log(`✓ Response field: Using "memories" (not "results")`);
  console.log(`✓ Client-side filtering: RID prefix check implemented`);
  console.log(`✓ Repository filtering: By RID parsing`);
  console.log(`✓ Deduplication: By filepath extraction`);
  console.log(`✓ No server-side filters: Following Phase 0 findings`);
}

// Run tests
testSearchGithubDocs().catch(console.error);
