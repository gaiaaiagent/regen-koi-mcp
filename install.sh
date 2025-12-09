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

# Minimum Node.js version required (pino logger needs v19.9.0+ for diagnostics_channel.tracingChannel)
MIN_NODE_VERSION=20

# Function to extract major version number from node version string
get_node_major_version() {
    echo "$1" | sed 's/v//' | cut -d. -f1
}

# Function to find a compatible Node.js installation
find_compatible_node() {
    local found_path=""
    local found_version=0

    # Check nvm installations
    if [ -d "$HOME/.nvm/versions/node" ]; then
        for node_dir in "$HOME/.nvm/versions/node"/v*/bin; do
            if [ -f "$node_dir/node" ]; then
                local ver=$("$node_dir/node" --version 2>/dev/null)
                local major=$(get_node_major_version "$ver")
                if [ "$major" -ge "$MIN_NODE_VERSION" ] && [ "$major" -gt "$found_version" ]; then
                    found_version=$major
                    found_path="$node_dir"
                fi
            fi
        done
    fi

    # Check fnm installations
    if [ -d "$HOME/.fnm" ]; then
        for node_dir in "$HOME/.fnm/node-versions"/v*/installation/bin; do
            if [ -f "$node_dir/node" ]; then
                local ver=$("$node_dir/node" --version 2>/dev/null)
                local major=$(get_node_major_version "$ver")
                if [ "$major" -ge "$MIN_NODE_VERSION" ] && [ "$major" -gt "$found_version" ]; then
                    found_version=$major
                    found_path="$node_dir"
                fi
            fi
        done
    fi

    # Check Homebrew on macOS
    if [ -d "/opt/homebrew/bin" ] && [ -f "/opt/homebrew/bin/node" ]; then
        local ver=$(/opt/homebrew/bin/node --version 2>/dev/null)
        local major=$(get_node_major_version "$ver")
        if [ "$major" -ge "$MIN_NODE_VERSION" ] && [ "$major" -gt "$found_version" ]; then
            found_version=$major
            found_path="/opt/homebrew/bin"
        fi
    fi

    # Check /usr/local/bin
    if [ -f "/usr/local/bin/node" ]; then
        local ver=$(/usr/local/bin/node --version 2>/dev/null)
        local major=$(get_node_major_version "$ver")
        if [ "$major" -ge "$MIN_NODE_VERSION" ] && [ "$major" -gt "$found_version" ]; then
            found_version=$major
            found_path="/usr/local/bin"
        fi
    fi

    echo "$found_path"
}

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not installed"
    echo "Please install Node.js $MIN_NODE_VERSION+ from https://nodejs.org"
    exit 1
fi

# Check Node.js version
CURRENT_NODE_VERSION=$(node --version)
CURRENT_MAJOR=$(get_node_major_version "$CURRENT_NODE_VERSION")

echo "✓ Node.js $CURRENT_NODE_VERSION detected"

# Variables for the config
NPX_COMMAND="npx"
NODE_PATH_ENV=""

if [ "$CURRENT_MAJOR" -lt "$MIN_NODE_VERSION" ]; then
    echo "⚠️  Node.js $CURRENT_NODE_VERSION is too old (need v$MIN_NODE_VERSION+)"
    echo "   Searching for a compatible Node.js installation..."

    COMPATIBLE_PATH=$(find_compatible_node)

    if [ -n "$COMPATIBLE_PATH" ]; then
        COMPAT_VERSION=$("$COMPATIBLE_PATH/node" --version)
        echo "✓ Found compatible Node.js $COMPAT_VERSION at $COMPATIBLE_PATH"
        NPX_COMMAND="$COMPATIBLE_PATH/npx"
        NODE_PATH_ENV="$COMPATIBLE_PATH:/usr/local/bin:/usr/bin:/bin"
    else
        echo ""
        echo "❌ Error: No compatible Node.js version found"
        echo ""
        echo "The regen-koi MCP server requires Node.js v$MIN_NODE_VERSION or higher."
        echo "Your current version ($CURRENT_NODE_VERSION) is not supported."
        echo ""
        echo "Please install a newer Node.js version:"
        echo "  - Using nvm: nvm install $MIN_NODE_VERSION && nvm use $MIN_NODE_VERSION"
        echo "  - Using Homebrew: brew install node@$MIN_NODE_VERSION"
        echo "  - From nodejs.org: https://nodejs.org"
        echo ""
        exit 1
    fi
else
    echo "✓ Node.js version is compatible"
fi

echo "✓ npx is available"
echo ""

# MCP server configuration - use full path if needed
if [ -n "$NODE_PATH_ENV" ]; then
    MCP_CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "regen-koi": {
      "command": "$NPX_COMMAND",
      "args": ["-y", "regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi",
        "PATH": "$NODE_PATH_ENV"
      }
    }
  }
}
EOF
)
else
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
fi

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
        # Build the JSON config based on whether we need a custom path
        if [ -n "$NODE_PATH_ENV" ]; then
            CLI_CONFIG="{\"command\":\"$NPX_COMMAND\",\"args\":[\"-y\",\"regen-koi-mcp@latest\"],\"env\":{\"KOI_API_ENDPOINT\":\"https://regen.gaiaai.xyz/api/koi\",\"PATH\":\"$NODE_PATH_ENV\"}}"
        else
            CLI_CONFIG='{"command":"npx","args":["-y","regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}'
        fi

        # Try to add the MCP server
        if claude mcp add-json regen-koi "$CLI_CONFIG" 2>&1 | grep -q "added successfully\|already exists"; then
            echo "   ✅ Configured Claude Code CLI"
        else
            echo "   ⚠️  Could not auto-configure Claude Code"
            echo "   Run manually: claude mcp add-json regen-koi '$CLI_CONFIG'"
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
