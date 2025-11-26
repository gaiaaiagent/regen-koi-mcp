#!/bin/bash
# Test Phase 1b - get_repo_overview and get_tech_stack tools
# These tests verify the new tools work against the production KOI API

API="https://regen.gaiaai.xyz/api/koi"

echo "=========================================="
echo "Phase 1b Tool Testing"
echo "=========================================="
echo ""

echo "=== Test 1: get_repo_overview - Check if regen-ledger README data exists ==="
echo "Query: regen-ledger README documentation overview"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "regen-ledger README documentation overview", "limit": 10}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 2: get_repo_overview - Check if regen-web README data exists ==="
echo "Query: regen-web README documentation overview"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "regen-web README documentation overview", "limit": 10}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 3: get_repo_overview - Check if regen-data-standards README data exists ==="
echo "Query: regen-data-standards README documentation overview"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "regen-data-standards README documentation overview", "limit": 10}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 4: get_repo_overview - Check if regenie-corpus README data exists ==="
echo "Query: regenie-corpus README documentation overview"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "regenie-corpus README documentation overview", "limit": 10}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 5: get_tech_stack - Check if package.json data exists ==="
echo "Query: package.json dependencies frameworks"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "package.json dependencies frameworks", "limit": 15}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 6: get_tech_stack - Check if go.mod data exists ==="
echo "Query: go.mod go dependencies modules"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "go.mod go dependencies modules", "limit": 15}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 7: get_tech_stack - Check if Docker/CI data exists ==="
echo "Query: Dockerfile CI CD configuration"
curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "Dockerfile CI CD configuration", "limit": 15}' | jq -r '.memories | length as $len | "Found \($len) results"'
echo ""

echo "=== Test 8: Verify GitHub RID filtering works ==="
echo "Query: package.json (should return memories with regen.github: RIDs)"
SAMPLE=$(curl -s -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "package.json", "limit": 5}')
echo "$SAMPLE" | jq -r '.memories[0].rid // "No results"'
echo ""

echo "=========================================="
echo "Phase 1b Testing Complete"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Tests 1-4 verify data availability for get_repo_overview"
echo "- Tests 5-7 verify data availability for get_tech_stack"
echo "- Test 8 verifies RID format for client-side filtering"
echo ""
echo "Next Steps:"
echo "1. Review test results above"
echo "2. Run the MCP server to test the actual tools"
echo "3. If all tests pass, Phase 1b is complete"
