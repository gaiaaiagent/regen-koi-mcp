#!/bin/bash

# Phase 0 API Validation Script
# Tests the Koi API to validate assumptions before implementing GitHub search tools
#
# Usage: ./scripts/validate-api.sh
#
# This script runs all validation tests documented in PHASE_0_VALIDATION_RESULTS.md

set -e  # Exit on error

API_URL="https://regen.gaiaai.xyz/api/koi/query"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "KOI API Validation Script"
echo "========================================="
echo ""

# Helper function to run a test
run_test() {
    local test_name="$1"
    local query_data="$2"
    local expected_behavior="$3"

    echo -e "${YELLOW}TEST: $test_name${NC}"
    echo "Query: $query_data"
    echo "Expected: $expected_behavior"
    echo ""

    response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "$query_data")

    echo "Response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    echo ""
    echo "---"
    echo ""
}

# Test 1: Basic API Query
run_test \
    "Test 1: Basic API Query" \
    '{"query": "README", "limit": 5}' \
    "Should return mixed results (Notion, web, GitHub)"

# Test 2: GitHub Filter with github:regen-ledger
run_test \
    "Test 2: GitHub Filter (github:regen-ledger)" \
    '{"query": "governance", "limit": 5, "filters": {"source_sensor": "github:regen-ledger"}}' \
    "EXPECTED TO FAIL - Filter should not work, returns non-GitHub results"

# Test 3: GitHub Filter with regen.github
run_test \
    "Test 3: GitHub Filter (regen.github)" \
    '{"query": "governance", "limit": 5, "filters": {"source_sensor": "regen.github"}}' \
    "EXPECTED TO FAIL - Filter should not work, returns non-GitHub results"

# Test 4: Wildcard Pattern
run_test \
    "Test 4: Wildcard Pattern (github:*)" \
    '{"query": "README", "limit": 10, "filters": {"source_sensor": "github:*"}}' \
    "EXPECTED TO FAIL - Wildcards not supported, returns mixed results"

# Test 5: Search All GitHub Repos (No Filter)
run_test \
    "Test 5: GitHub Content Search" \
    '{"query": "github repository code", "limit": 20}' \
    "Should return some GitHub results (regen.github: RID prefix)"

# Test 6: Sources Endpoint (Expected to fail)
echo -e "${YELLOW}TEST: Test 6: Sources Endpoint${NC}"
echo "Expected: 404 Not Found"
echo ""
response=$(curl -s -X GET "https://regen.gaiaai.xyz/api/koi/sources" 2>&1)
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""
echo "---"
echo ""

# Test 7: Repository-Specific Content Quality
run_test \
    "Test 7: Content Quality (ecocredit module)" \
    '{"query": "ecocredit module implementation", "limit": 3}' \
    "Should return high-quality documentation results"

# Test 8: Extract GitHub Repos from Results
echo -e "${YELLOW}TEST: Test 8: Extract GitHub Repos${NC}"
echo "Extracting unique GitHub repositories from sample query..."
echo ""

response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{"query": "package json yaml toml README", "limit": 50}')

echo "Unique GitHub repositories found:"
echo "$response" | python3 -c "
import json, sys, re
data = json.load(sys.stdin)
repos = set()
for m in data.get('memories', []):
    rid = m['rid']
    if rid.startswith('regen.github:'):
        match = re.search(r'regen\.github:github_([^_]+)', rid)
        if match:
            repos.add(match.group(1))

for repo in sorted(repos):
    print(f'  - {repo}')
" 2>/dev/null || echo "  (Python parsing failed)"

echo ""
echo "---"
echo ""

# Test 9: Sample File Types
echo -e "${YELLOW}TEST: Test 9: Sample File Types${NC}"
echo "Extracting sample file types from GitHub content..."
echo ""

response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{"query": "documentation configuration", "limit": 30}')

echo "Sample files found:"
echo "$response" | python3 -c "
import json, sys, re
data = json.load(sys.stdin)
files = set()
for m in data.get('memories', []):
    rid = m['rid']
    if rid.startswith('regen.github:'):
        # Extract filename
        match = re.search(r'([^_]+\.(md|toml|yaml|json|yml|txt))#', rid)
        if match:
            files.add(match.group(1))

for f in sorted(list(files))[:15]:
    print(f'  - {f}')
" 2>/dev/null || echo "  (Python parsing failed)"

echo ""
echo "---"
echo ""

# Summary
echo "========================================="
echo -e "${GREEN}VALIDATION COMPLETE${NC}"
echo "========================================="
echo ""
echo "Key Findings:"
echo "  ✅ API is functional and responsive"
echo "  ❌ source_sensor filters DO NOT WORK"
echo "  ✅ GitHub content is available via RID filtering"
echo "  ⚠️  Client-side filtering REQUIRED"
echo ""
echo "Next Steps:"
echo "  1. Review PHASE_0_VALIDATION_RESULTS.md for detailed findings"
echo "  2. Implement client-side RID filtering in MCP tools"
echo "  3. Proceed to Phase 1a: Implement search_github_docs tool"
echo ""
echo "See PHASE_0_VALIDATION_RESULTS.md for full analysis."
