/**
 * Suite A (Contract) Test: query_code_graph query_type enum matches backend.
 *
 * Goal: prevent schema drift where the MCP tool advertises query types that the
 * KOI /graph endpoint doesn't support (or vice versa).
 *
 * Usage:
 *   KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi npx tsx evals/contract_query_code_graph_query_types.ts
 */

import { GRAPH_QUERY_TYPES } from '../src/graph_query_types.js';

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function diff(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return a.filter((x) => !bSet.has(x));
}

async function getBackendSupportedQueryTypes(graphEndpoint: string): Promise<string[]> {
  const response = await fetch(graphEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': process.env.KOI_USER_EMAIL || 'contract-test@local',
    },
    body: JSON.stringify({ query_type: '__invalid__' }),
  });

  const text = await response.text();
  if (response.ok) {
    throw new Error(`Expected 400 for invalid query_type, got ${response.status}: ${text.slice(0, 200)}`);
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Backend returned non-JSON error: ${text.slice(0, 200)}`);
  }

  const supported = payload?.data?.supported_query_types;
  if (!Array.isArray(supported) || !supported.every((x: any) => typeof x === 'string')) {
    throw new Error(`Could not read data.supported_query_types from backend: ${text.slice(0, 500)}`);
  }

  return supported;
}

async function main(): Promise<void> {
  const koiApiEndpoint = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';
  const graphEndpoint = `${koiApiEndpoint.replace(/\/$/, '')}/graph`;

  const toolTypes = uniq([...GRAPH_QUERY_TYPES]).sort();
  const backendTypes = uniq(await getBackendSupportedQueryTypes(graphEndpoint)).sort();

  const extraInTool = diff(toolTypes, backendTypes).sort();
  const missingInTool = diff(backendTypes, toolTypes).sort();

  if (extraInTool.length || missingInTool.length) {
    console.error('❌ query_code_graph query_type mismatch\n');
    console.error(`KOI_API_ENDPOINT: ${koiApiEndpoint}`);
    console.error('');
    if (extraInTool.length) {
      console.error('Present in MCP tool, missing in backend:');
      extraInTool.forEach((t) => console.error(`- ${t}`));
      console.error('');
    }
    if (missingInTool.length) {
      console.error('Present in backend, missing in MCP tool:');
      missingInTool.forEach((t) => console.error(`- ${t}`));
      console.error('');
    }
    process.exit(1);
  }

  console.log('✅ query_code_graph query_type enum matches backend');
  console.log(`KOI_API_ENDPOINT: ${koiApiEndpoint}`);
  console.log(`Count: ${toolTypes.length}`);
}

await main();

