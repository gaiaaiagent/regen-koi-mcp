#!/usr/bin/env tsx
/**
 * Test Script for Graph Tool
 *
 * Tests all 5 query types to ensure the graph tool is working correctly.
 */

import { executeGraphTool } from './graph_tool.js';
import { createGraphClient } from './graph_client.js';

async function testGraphStats() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST: Graph Statistics');
  console.log('='.repeat(80));

  const client = createGraphClient();
  try {
    const stats = await client.getStats();
    console.log('\nGraph Statistics:');
    console.log('Node counts:', stats.node_counts);
    console.log('Edge counts:', stats.edge_counts);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await client.close();
  }
}

async function testKeeperForMsg() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: keeper_for_msg');
  console.log('='.repeat(80));

  const result = await executeGraphTool({
    query_type: 'keeper_for_msg',
    entity_name: 'MsgCreate'
  });

  console.log('\nMarkdown Response:');
  console.log(result.content[0].text);

  if (result.content[1] && result.content[1].type === 'json') {
    console.log('\nJSON Data:');
    console.log(JSON.stringify(result.content[1].data, null, 2));
  }
}

async function testMsgsForKeeper() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: msgs_for_keeper');
  console.log('='.repeat(80));

  const result = await executeGraphTool({
    query_type: 'msgs_for_keeper',
    entity_name: 'Keeper'
  });

  console.log('\nMarkdown Response:');
  console.log(result.content[0].text);

  if (result.content[1] && result.content[1].type === 'json') {
    console.log('\nJSON Data:');
    console.log(JSON.stringify(result.content[1].data, null, 2));
  }
}

async function testDocsMentioning() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: docs_mentioning');
  console.log('='.repeat(80));

  const result = await executeGraphTool({
    query_type: 'docs_mentioning',
    entity_name: 'MsgCreate'
  });

  console.log('\nMarkdown Response:');
  console.log(result.content[0].text);

  if (result.content[1] && result.content[1].type === 'json') {
    console.log('\nJSON Data:');
    console.log(JSON.stringify(result.content[1].data, null, 2));
  }
}

async function testEntitiesInDoc() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: entities_in_doc');
  console.log('='.repeat(80));

  // First, let's get a list of documents
  const client = createGraphClient();
  try {
    const docsQuery = `
      MATCH (d:Document)
      RETURN d.file_path as file_path
      LIMIT 1
    `;
    const docs = await (client as any).executeCypher(docsQuery);

    if (docs.length === 0) {
      console.log('\nNo documents found in graph (MENTIONS edges not yet created)');
      return;
    }

    const result = await executeGraphTool({
      query_type: 'entities_in_doc',
      doc_path: docs[0].file_path
    });

    console.log('\nMarkdown Response:');
    console.log(result.content[0].text);

    if (result.content[1] && result.content[1].type === 'json') {
      console.log('\nJSON Data:');
      console.log(JSON.stringify(result.content[1].data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await client.close();
  }
}

async function testRelatedEntities() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: related_entities');
  console.log('='.repeat(80));

  const result = await executeGraphTool({
    query_type: 'related_entities',
    entity_name: 'MsgCreate'
  });

  console.log('\nMarkdown Response:');
  console.log(result.content[0].text);

  if (result.content[1] && result.content[1].type === 'json') {
    console.log('\nJSON Data:');
    console.log(JSON.stringify(result.content[1].data, null, 2));
  }
}

async function testErrorHandling() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Error Handling');
  console.log('='.repeat(80));

  // Test 1: Missing required parameter
  console.log('\nTest 6a: Missing entity_name for keeper_for_msg');
  const result1 = await executeGraphTool({
    query_type: 'keeper_for_msg'
  });
  console.log(result1.content[0].text);

  // Test 2: Invalid query type
  console.log('\nTest 6b: Invalid query type');
  const result2 = await executeGraphTool({
    query_type: 'invalid_type'
  });
  console.log(result2.content[0].text);

  // Test 3: Entity not found
  console.log('\nTest 6c: Entity not found');
  const result3 = await executeGraphTool({
    query_type: 'keeper_for_msg',
    entity_name: 'MsgNonExistent'
  });
  console.log(result3.content[0].text);
}

async function testAllEntities() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 7: List All Entities');
  console.log('='.repeat(80));

  const client = createGraphClient();
  try {
    console.log('\nAll Keepers:');
    const keepers = await client.getAllKeepers();
    keepers.forEach((k, i) => {
      console.log(`${i + 1}. ${k.name} (${k.file_path}:${k.line_number})`);
    });

    console.log('\nAll Msgs (first 10):');
    const msgs = await client.getAllMsgs();
    msgs.slice(0, 10).forEach((m, i) => {
      console.log(`${i + 1}. ${m.name} (${m.file_path}:${m.line_number})`);
    });
    if (msgs.length > 10) {
      console.log(`... and ${msgs.length - 10} more`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await client.close();
  }
}

async function main() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'GRAPH TOOL TEST SUITE' + ' '.repeat(37) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');

  try {
    // Run all tests
    await testGraphStats();
    await testAllEntities();
    await testKeeperForMsg();
    await testMsgsForKeeper();
    await testDocsMentioning();
    await testEntitiesInDoc();
    await testRelatedEntities();
    await testErrorHandling();

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
