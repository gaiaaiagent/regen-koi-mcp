#!/bin/bash

# Complete setup script for Regen KOI MCP Server
# Installs all dependencies (Node.js and Python) and builds the project

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "🌱 Regen KOI MCP Server Setup"
echo "=============================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo "✓ Node.js $(node --version) detected"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://python.org"
    exit 1
fi

echo "✓ Python $(python3 --version) detected"
echo ""

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install
echo ""

# Setup Python environment
echo "🐍 Setting up Python environment..."
cd python
./setup.sh
cd ..
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
echo ""

# Configure clients
echo "⚙️  Configuring MCP clients..."
npm run setup
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure your database in: python/config/weekly_aggregator.json"
echo "2. Restart Claude Desktop (or your MCP client)"
echo "3. Start using the KOI tools!"
echo ""
