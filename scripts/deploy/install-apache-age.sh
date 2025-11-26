#!/bin/bash
# Install Apache AGE extension for PostgreSQL
# This script installs AGE on an existing PostgreSQL installation

set -e

echo "================================================"
echo "Apache AGE Installation Script"
echo "================================================"

# Configuration
AGE_VERSION="${AGE_VERSION:-PG15/1.5.0}"
PG_CONFIG="${PG_CONFIG:-pg_config}"
INSTALL_DEPS="${INSTALL_DEPS:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check PostgreSQL version
echo -e "\n${YELLOW}Checking PostgreSQL version...${NC}"
PG_VERSION=$($PG_CONFIG --version | grep -oP '\d+' | head -1)
echo "PostgreSQL version: $PG_VERSION"

if [ "$PG_VERSION" -lt 12 ]; then
    echo -e "${RED}Error: Apache AGE requires PostgreSQL 12 or higher${NC}"
    exit 1
fi

# Install build dependencies
if [ "$INSTALL_DEPS" = "true" ]; then
    echo -e "\n${YELLOW}Installing build dependencies...${NC}"
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y build-essential git postgresql-server-dev-$PG_VERSION \
            libreadline-dev zlib1g-dev flex bison
    elif command -v yum &> /dev/null; then
        sudo yum install -y gcc make git postgresql$PG_VERSION-devel \
            readline-devel zlib-devel flex bison
    elif command -v brew &> /dev/null; then
        brew install flex bison
    else
        echo -e "${YELLOW}Warning: Could not detect package manager. Please install build dependencies manually.${NC}"
    fi
fi

# Clone and build Apache AGE
echo -e "\n${YELLOW}Cloning Apache AGE (version: release/$AGE_VERSION)...${NC}"
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

git clone --branch "release/$AGE_VERSION" https://github.com/apache/age.git
cd age

echo -e "\n${YELLOW}Building Apache AGE...${NC}"
make PG_CONFIG=$PG_CONFIG

echo -e "\n${YELLOW}Installing Apache AGE...${NC}"
sudo make PG_CONFIG=$PG_CONFIG install

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo -e "\n${GREEN}Apache AGE installed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Connect to your database: psql -d your_database"
echo "2. Enable the extension: CREATE EXTENSION age;"
echo "3. Load AGE: LOAD 'age';"
echo "4. Set search path: SET search_path = ag_catalog, \"\$user\", public;"
echo "5. Create a graph: SELECT create_graph('regen_graph');"
echo ""
echo "Or run: ./scripts/deploy/setup-database.sh"
