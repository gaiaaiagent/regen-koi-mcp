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

echo "✅ MCP Client setup complete!"
echo ""

# Ask if user wants to set up the local API server
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Optional: Set up local KOI API Server"
echo ""
echo "By default, the MCP client connects to the hosted KOI API."
echo "Would you like to set up a local API server instead?"
echo ""
read -p "Set up local server? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔧 Setting up local KOI API Server..."
    cd server
    ./setup.sh
    cd ..
    echo ""
    echo "✅ Local server setup complete!"
    echo ""
    echo "To start the server:"
    echo "  cd server && ./start.sh --background"
    echo ""
    echo "To stop the server:"
    echo "  cd server && ./stop.sh"
    echo ""
    echo "Then configure the MCP client to use: http://localhost:8301/api/koi"
else
    echo ""
    echo "Skipping local server setup."
    echo "The MCP client will use the hosted API at: https://regen.gaiaai.xyz/api/koi"
    echo ""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop (or your MCP client)"
echo "2. Start using the KOI tools!"
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "3. (Optional) Configure your local database in: server/.env"
    echo ""
fi
