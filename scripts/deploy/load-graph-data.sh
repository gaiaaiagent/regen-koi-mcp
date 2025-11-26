#!/bin/bash
# Load graph data for Regen KOI MCP
# Extracts entities from repositories and loads them into the graph

set -e

echo "================================================"
echo "Regen KOI MCP - Graph Data Loading"
echo "================================================"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_SCRIPTS="$PROJECT_ROOT/python/scripts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Python
echo -e "\n${YELLOW}Checking Python environment...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is required${NC}"
    exit 1
fi

# Check required Python packages
echo "Checking required packages..."
python3 -c "import psycopg2" 2>/dev/null || {
    echo -e "${YELLOW}Installing psycopg2...${NC}"
    pip3 install psycopg2-binary
}

python3 -c "import requests" 2>/dev/null || {
    echo -e "${YELLOW}Installing requests...${NC}"
    pip3 install requests
}

# Check if scripts exist
if [ ! -d "$PYTHON_SCRIPTS" ]; then
    echo -e "${RED}Error: Python scripts not found at $PYTHON_SCRIPTS${NC}"
    exit 1
fi

# Step 1: Extract entities (if multi_lang_extractor.py exists)
if [ -f "$PYTHON_SCRIPTS/multi_lang_extractor.py" ]; then
    echo -e "\n${YELLOW}Step 1: Extracting entities from repositories...${NC}"
    echo "This may take a few minutes..."
    cd "$PYTHON_SCRIPTS"
    python3 multi_lang_extractor.py
    echo -e "${GREEN}Entity extraction complete!${NC}"
else
    echo -e "${YELLOW}Skipping entity extraction (multi_lang_extractor.py not found)${NC}"
fi

# Step 2: Load entities into graph
if [ -f "$PYTHON_SCRIPTS/load_entities.py" ]; then
    echo -e "\n${YELLOW}Step 2: Loading entities into graph...${NC}"
    cd "$PYTHON_SCRIPTS"
    python3 load_entities.py
    echo -e "${GREEN}Entity loading complete!${NC}"
else
    echo -e "${YELLOW}Skipping entity loading (load_entities.py not found)${NC}"
fi

# Step 3: Generate RAPTOR summaries (optional)
if [ -f "$PYTHON_SCRIPTS/raptor_summarizer.py" ]; then
    echo -e "\n${YELLOW}Step 3: Generating RAPTOR module summaries...${NC}"
    echo "This requires OpenAI API key in environment"
    if [ -n "$OPENAI_API_KEY" ]; then
        cd "$PYTHON_SCRIPTS"
        python3 raptor_summarizer.py
        echo -e "${GREEN}RAPTOR summaries complete!${NC}"
    else
        echo -e "${YELLOW}Skipping RAPTOR (OPENAI_API_KEY not set)${NC}"
    fi
else
    echo -e "${YELLOW}Skipping RAPTOR (raptor_summarizer.py not found)${NC}"
fi

# Step 4: Create MENTIONS edges
if [ -f "$PYTHON_SCRIPTS/create_mentions.py" ]; then
    echo -e "\n${YELLOW}Step 4: Creating MENTIONS edges...${NC}"
    cd "$PYTHON_SCRIPTS"
    python3 create_mentions.py
    echo -e "${GREEN}MENTIONS edges created!${NC}"
else
    echo -e "${YELLOW}Skipping MENTIONS edges (create_mentions.py not found)${NC}"
fi

# Verify results
echo -e "\n${YELLOW}Verifying graph data...${NC}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-eliza}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

export PGPASSWORD="$DB_PASSWORD"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF' 2>/dev/null || echo "Could not verify graph (AGE may not be installed)"
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

SELECT * FROM cypher('regen_graph', $$
    MATCH (n)
    RETURN labels(n)[0] as node_type, count(*) as count
    ORDER BY count DESC
$$) as (node_type agtype, count agtype);
EOF

echo -e "\n${GREEN}Graph data loading complete!${NC}"
echo ""
echo "Summary of available scripts:"
echo "  - multi_lang_extractor.py: Extract entities from repos"
echo "  - load_entities.py: Load entities into AGE graph"
echo "  - raptor_summarizer.py: Generate module summaries"
echo "  - create_mentions.py: Link documents to code entities"
