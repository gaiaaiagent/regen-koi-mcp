#!/bin/bash
# Test search_github_docs tool via Hybrid RAG API

echo "========================================="
echo "Testing Hybrid RAG API - search_github_docs"
echo "========================================="
echo ""

echo "Test 1: Search for 'cosmos sdk module'"
echo "----------------------------------------"
curl -s -X POST http://localhost:8301/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cosmos sdk module",
    "limit": 5
  }' | jq -r '.memories[] | "RID: \(.rid)\nScore: \(.score)\nPreview: \(.text[0:100])...\n"'

echo ""
echo "Test 2: Search for 'data module' in regen-ledger"
echo "------------------------------------------------"
curl -s -X POST http://localhost:8301/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data module",
    "limit": 10
  }' | jq -r '.memories[] | select(.rid | contains("regen-ledger")) | "RID: \(.rid)\nScore: \(.score)\nPreview: \(.text[0:100])...\n"' | head -20

echo ""
echo "Test 3: Search for Protocol Buffers"
echo "------------------------------------"
curl -s -X POST http://localhost:8301/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "protocol buffer definition",
    "limit": 10
  }' | jq -r '.memories[] | select(.rid | contains(".proto")) | "RID: \(.rid)\nScore: \(.score)\nPreview: \(.text[0:100])...\n"' | head -20

echo ""
echo "Test 4: Search for 'ecocredit module'"
echo "--------------------------------------"
curl -s -X POST http://localhost:8301/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ecocredit module",
    "limit": 5
  }' | jq -r '.memories[] | "RID: \(.rid)\nScore: \(.score)\nPreview: \(.text[0:100])...\n"'

echo ""
echo "Test 5: Count total results for 'cosmos'"
echo "-----------------------------------------"
curl -s -X POST http://localhost:8301/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cosmos",
    "limit": 20
  }' | jq -r '"Total memories returned: \(.memories | length)"'

echo ""
echo "========================================="
echo "API Tests Complete"
echo "========================================="
