#!/bin/bash

# Start KOI API Server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load environment variables from .env if it exists
if [ -f "../.env" ]; then
    echo "Loading environment from ../.env"
    export $(grep -v '^#' ../.env | xargs)
fi

if [ -f ".env" ]; then
    echo "Loading environment from .env"
    export $(grep -v '^#' .env | xargs)
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run ./setup.sh first"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Default configuration
export KOI_DB_HOST=${KOI_DB_HOST:-localhost}
export KOI_DB_PORT=${KOI_DB_PORT:-5432}
export KOI_DB_NAME=${KOI_DB_NAME:-eliza}
export KOI_DB_USER=${KOI_DB_USER:-postgres}
export KOI_DB_PASSWORD=${KOI_DB_PASSWORD:-postgres}
export KOI_API_PORT=${KOI_API_PORT:-8301}
export BGE_SERVER_URL=${BGE_SERVER_URL:-http://localhost:8090}

echo "🚀 Starting KOI API Server..."
echo "   Database: $KOI_DB_NAME @ $KOI_DB_HOST:$KOI_DB_PORT"
echo "   Port: $KOI_API_PORT"
echo ""

# Check if running in background mode
if [ "$1" == "--background" ] || [ "$1" == "-b" ]; then
    python3 src/koi_api_server.py > koi_api.log 2>&1 &
    echo $! > koi_api.pid
    echo "✅ KOI API Server started in background (PID: $(cat koi_api.pid))"
    echo "   Logs: $SCRIPT_DIR/koi_api.log"
    echo "   Stop with: ./stop.sh"
else
    python3 src/koi_api_server.py
fi
