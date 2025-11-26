#!/usr/bin/env node
/**
 * Diagnostic script to see actual RID patterns from the API
 */

import axios from 'axios';

const API_ENDPOINT = 'https://regen.gaiaai.xyz/api/koi';

const apiClient = axios.create({
  baseURL: API_ENDPOINT,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

async function checkRids(query, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Query: "${query}"\n`);

  const response = await apiClient.post('/query', {
    query: query,
    limit: 10
  });

  const data = response.data;
  const memories = data?.memories || [];

  console.log(`Total results: ${memories.length}\n`);

  const githubMemories = memories.filter(m => m.rid?.startsWith('regen.github:'));
  console.log(`GitHub results: ${githubMemories.length}\n`);

  if (githubMemories.length > 0) {
    console.log(`Sample RIDs:`);
    githubMemories.slice(0, 5).forEach((m, i) => {
      console.log(`${i + 1}. ${m.rid}`);
    });
  } else {
    console.log(`Sample non-GitHub RIDs:`);
    memories.slice(0, 3).forEach((m, i) => {
      console.log(`${i + 1}. ${m.rid}`);
    });
  }
}

async function main() {
  console.log('==========================================');
  console.log('RID Pattern Diagnostics');
  console.log('==========================================');

  try {
    await checkRids('regen-ledger README', 'Test 1: regen-ledger README');
    await checkRids('regen-web README', 'Test 2: regen-web README');
    await checkRids('package.json', 'Test 3: package.json');
    await checkRids('go.mod', 'Test 4: go.mod');
    await checkRids('github documentation', 'Test 5: Generic GitHub docs');

    console.log('\n==========================================');
    console.log('Diagnostics complete');
    console.log('==========================================');

  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();
