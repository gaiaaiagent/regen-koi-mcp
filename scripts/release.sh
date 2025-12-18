#!/bin/bash
# Release script for regen-koi-mcp
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 [patch|minor|major]"
    echo "  patch - Bug fixes (1.0.0 -> 1.0.1)"
    echo "  minor - New features (1.0.0 -> 1.1.0)"
    echo "  major - Breaking changes (1.0.0 -> 2.0.0)"
    exit 1
fi

echo "=== Regen KOI MCP Release ==="
echo ""

# Ensure we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo "Error: Must be on main branch (currently on $BRANCH)"
    exit 1
fi

# Ensure working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory is not clean. Commit or stash changes first."
    exit 1
fi

# Pull latest
echo "Pulling latest changes..."
git pull origin main

# Run build to verify
echo "Running build..."
npm run clean
npm run build

# Bump version (this creates a commit and tag)
echo "Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE -m "Release v%s"

NEW_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "=== Version bumped to v$NEW_VERSION ==="
echo ""

# Push changes and tags
echo "Pushing to GitHub..."
git push origin main --tags

echo ""
echo "=== Done! ==="
echo ""
echo "GitHub Actions will now automatically publish v$NEW_VERSION to npm."
echo "Monitor progress at: https://github.com/gaiaaiagent/regen-koi-mcp/actions"
echo ""
echo "After publish completes, users get the update automatically:"
echo "  npx -y regen-koi-mcp@latest"
