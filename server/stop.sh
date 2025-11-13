#!/bin/bash

# Stop KOI API Server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

if [ -f "koi_api.pid" ]; then
    PID=$(cat koi_api.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "🛑 Stopping KOI API Server (PID: $PID)..."
        kill $PID
        rm koi_api.pid
        echo "✅ KOI API Server stopped"
    else
        echo "⚠️  Process $PID not found"
        rm koi_api.pid
    fi
else
    echo "⚠️  PID file not found. Server may not be running in background."
    echo "If the server is running in foreground, press Ctrl+C to stop it."
fi
