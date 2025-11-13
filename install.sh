#!/bin/bash

# Quick Install Script for Regen KOI MCP Server
# This script configures Claude Desktop and Claude Code to use the npm version

set -e

echo ""
echo "🌱 Regen KOI MCP Server - Quick Install"
echo "========================================"
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    CLAUDE_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
    CLAUDE_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
else
    echo "⚠️  Warning: Unrecognized OS type: $OSTYPE"
    echo "Please manually configure Claude Desktop config."
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not installed"
    echo "Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo "✓ Node.js $(node --version) detected"
echo "✓ npx is available"
echo ""

# MCP server configuration
MCP_CONFIG='{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["-y", "regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
      }
    }
  }
}'

# Function to merge or create config
configure_claude_desktop() {
    echo "📝 Configuring Claude Desktop..."

    # Create config directory if it doesn't exist
    CONFIG_DIR=$(dirname "$CLAUDE_CONFIG")
    if [ ! -d "$CONFIG_DIR" ]; then
        mkdir -p "$CONFIG_DIR"
        echo "   Created directory: $CONFIG_DIR"
    fi

    # Check if config file exists
    if [ -f "$CLAUDE_CONFIG" ]; then
        echo "   Found existing config at: $CLAUDE_CONFIG"

        # Backup existing config
        BACKUP="${CLAUDE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CLAUDE_CONFIG" "$BACKUP"
        echo "   Created backup: $BACKUP"

        # Check if jq is available for proper JSON merging
        if command -v jq &> /dev/null; then
            # Use jq to properly merge the configurations
            TEMP_CONFIG=$(mktemp)
            jq -s '.[0] * .[1]' "$CLAUDE_CONFIG" <(echo "$MCP_CONFIG") > "$TEMP_CONFIG"
            mv "$TEMP_CONFIG" "$CLAUDE_CONFIG"
            echo "   ✅ Merged regen-koi into existing config"
        else
            # jq not available - check if config already has mcpServers
            if grep -q "mcpServers" "$CLAUDE_CONFIG"; then
                echo "   ⚠️  Config already has mcpServers section"
                echo "   Please manually add the regen-koi server:"
                echo ""
                echo '   "regen-koi": {'
                echo '     "command": "npx",'
                echo '     "args": ["-y", "regen-koi-mcp@latest"],'
                echo '     "env": {'
                echo '       "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"'
                echo '     }'
                echo '   }'
                echo ""
                echo "   Or install jq for automatic merging: https://jqlang.github.io/jq/"
                return
            else
                # Simple append - no existing mcpServers
                # Remove trailing } and add mcpServers
                sed -i.tmp '$ s/}$/,/' "$CLAUDE_CONFIG"
                cat >> "$CLAUDE_CONFIG" << 'EOF'
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["-y", "regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
      }
    }
  }
}
EOF
                rm -f "${CLAUDE_CONFIG}.tmp"
                echo "   ✅ Added regen-koi to config"
            fi
        fi
    else
        # No existing config - create new one
        echo "$MCP_CONFIG" > "$CLAUDE_CONFIG"
        echo "   ✅ Created new config at: $CLAUDE_CONFIG"
    fi
}

# Function to configure Claude Code CLI
configure_claude_code() {
    echo ""
    echo "📝 Configuring Claude Code CLI..."

    if command -v claude &> /dev/null; then
        # Try to add the MCP server
        if claude mcp add-json regen-koi '{"command":"npx","args":["-y","regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}' 2>&1 | grep -q "added successfully\|already exists"; then
            echo "   ✅ Configured Claude Code CLI"
        else
            echo "   ⚠️  Could not auto-configure Claude Code"
            echo "   Run manually: claude mcp add-json regen-koi '{\"command\":\"npx\",\"args\":[\"-y\",\"regen-koi-mcp@latest\"],\"env\":{\"KOI_API_ENDPOINT\":\"https://regen.gaiaai.xyz/api/koi\"}}'"
        fi
    else
        echo "   ⏭️  Claude Code CLI not found (optional)"
    fi
}

# Main installation flow
configure_claude_desktop
configure_claude_code

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Installation Complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop (Quit and reopen)"
echo "2. Try asking: 'Search Regen Network for carbon credits'"
echo "3. Or: 'Generate a weekly digest of Regen Network activity'"
echo ""
echo "📚 More info: https://github.com/gaiaaiagent/regen-koi-mcp"
echo ""
echo "🎉 You'll automatically get updates - no maintenance needed!"
echo ""
