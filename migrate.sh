#!/bin/bash

# Migration Script for Regen KOI MCP Server
# Migrates from git-based installation to npx for automatic updates

set -e

echo ""
echo "🌱 Regen KOI MCP Server - Migration to NPX"
echo "=========================================="
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
    CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    CLAUDE_DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
    CLAUDE_DESKTOP_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
else
    echo "⚠️  Warning: Unrecognized OS type: $OSTYPE"
    echo "Please manually update your config to use npx."
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Check if config exists
if [ ! -f "$CLAUDE_DESKTOP_CONFIG" ]; then
    echo "❌ Claude Desktop config not found at:"
    echo "   $CLAUDE_DESKTOP_CONFIG"
    echo ""
    echo "Run the install script instead:"
    echo "curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash"
    exit 1
fi

echo "Found Claude Desktop config"
echo ""

# Backup existing config
BACKUP="${CLAUDE_DESKTOP_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$CLAUDE_DESKTOP_CONFIG" "$BACKUP"
echo "✓ Created backup: $BACKUP"

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo ""
    echo "⚠️  jq not found - install it for automatic migration:"
    echo "   Mac: brew install jq"
    echo "   Linux: sudo apt install jq"
    echo ""
    echo "Manual migration needed:"
    echo "1. Open: $CLAUDE_DESKTOP_CONFIG"
    echo '2. Find the "regen-koi" server entry'
    echo '3. Change "command": "node" to "command": "npx"'
    echo '4. Change "args": ["/path/to/dist/index.js"] to "args": ["-y", "regen-koi-mcp@latest"]'
    echo ""
    echo "Or install jq and run this script again."
    exit 1
fi

# Check if regen-koi exists in config
if ! jq -e '.mcpServers."regen-koi"' "$CLAUDE_DESKTOP_CONFIG" > /dev/null 2>&1; then
    echo "❌ No 'regen-koi' server found in config"
    echo ""
    echo "Run the install script instead:"
    echo "curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash"
    exit 1
fi

echo "✓ Found existing regen-koi server configuration"
echo ""

# Update the config
echo "📝 Updating configuration to use npx..."

TEMP_CONFIG=$(mktemp)
jq '.mcpServers."regen-koi".command = "npx" |
    .mcpServers."regen-koi".args = ["-y", "regen-koi-mcp@latest"]' \
    "$CLAUDE_DESKTOP_CONFIG" > "$TEMP_CONFIG"

mv "$TEMP_CONFIG" "$CLAUDE_DESKTOP_CONFIG"

echo "   ✅ Updated Claude Desktop config"
echo ""

# Update Claude Code CLI if available
if command -v claude &> /dev/null; then
    echo "📝 Updating Claude Code CLI..."

    # Remove old server
    claude mcp remove regen-koi 2>&1 | grep -q "removed successfully\|not found" || true

    # Add new npx-based server
    if claude mcp add-json regen-koi '{"command":"npx","args":["-y","regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}' 2>&1 | grep -q "added successfully\|already exists"; then
        echo "   ✅ Updated Claude Code CLI"
    else
        echo "   ⚠️  Could not auto-update Claude Code"
        echo "   Run manually: claude mcp add-json regen-koi '{\"command\":\"npx\",\"args\":[\"-y\",\"regen-koi-mcp@latest\"],\"env\":{\"KOI_API_ENDPOINT\":\"https://regen.gaiaai.xyz/api/koi\"}}'"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Migration Complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop (Quit and reopen)"
echo "2. Restart Claude Code (if using)"
echo ""
echo "🎉 You'll now automatically get updates - no more git pull needed!"
echo ""
echo "You can safely delete your old git clone directory if desired."
echo ""
