#!/bin/bash

# Setup script for KOI API Server

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔧 Setting up KOI API Server..."

# Check if python3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "📥 Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ KOI API Server setup complete!"
echo ""
echo "To start the server:"
echo "  ./start.sh"
echo ""
echo "Configure in .env file or environment variables:"
echo "  KOI_DB_HOST, KOI_DB_PORT, KOI_DB_NAME, KOI_DB_USER, KOI_DB_PASSWORD"
echo "  KOI_API_PORT (default: 8301)"
echo ""
