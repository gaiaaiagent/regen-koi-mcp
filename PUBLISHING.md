# Publishing to NPM

This guide explains how to publish `regen-koi-mcp` to npm for automatic updates.

## One-Time Setup

### 1. Create npm Account (if you don't have one)

```bash
# Sign up at https://www.npmjs.com/signup
# Or create account via CLI:
npm adduser
```

### 2. Login to npm

```bash
npm login
```

You'll be prompted for:
- Username
- Password
- Email
- 2FA code (if enabled)

### 3. Verify Login

```bash
npm whoami
```

Should display your npm username.

## Publishing Process

### 1. Update Version

Follow semantic versioning (semver):
- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Minor** (1.0.0 → 1.1.0): New features (backward compatible)
- **Major** (1.0.0 → 2.0.0): Breaking changes

```bash
# Update version in package.json
npm version patch   # or minor, or major
```

This will:
- Update `package.json`
- Create a git tag
- Commit the change

### 2. Build and Test

```bash
# Clean build
npm run clean
npm run build

# Test the built package
node dist/index.js --help
```

### 3. Dry Run (Recommended)

See what will be published:

```bash
npm pack --dry-run
```

Or create an actual tarball to inspect:

```bash
npm pack
tar -tzf regen-koi-mcp-*.tgz
rm regen-koi-mcp-*.tgz
```

### 4. Publish to npm

```bash
# For first-time publish:
npm publish

# For updates:
npm publish
```

**Note:** The `prepublishOnly` script will automatically run `npm run clean && npm run build` before publishing.

### 5. Push Git Changes

```bash
git push origin main --tags
```

## Verify Publication

### Check on npm

```bash
# View package info
npm view regen-koi-mcp

# View all versions
npm view regen-koi-mcp versions
```

Or visit: https://www.npmjs.com/package/regen-koi-mcp

### Test Installation

```bash
# In a temporary directory
mkdir test-install
cd test-install
npx -y regen-koi-mcp@latest
```

## Publishing Checklist

Before publishing, ensure:

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated (if you have one)
- [ ] Version number is bumped appropriately
- [ ] Code is committed to git
- [ ] You're on the main branch
- [ ] Build succeeds (`npm run build`)
- [ ] Dry run looks correct (`npm pack --dry-run`)

## Automation (Future)

You can automate publishing using GitHub Actions:

```yaml
# .github/workflows/publish.yml
name: Publish to NPM

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Updating the Package

### For Bug Fixes

```bash
npm version patch
npm publish
git push origin main --tags
```

### For New Features

```bash
npm version minor
npm publish
git push origin main --tags
```

### For Breaking Changes

```bash
npm version major
npm publish
git push origin main --tags
```

## Unpublishing (Emergency Only)

⚠️ **Only use within 72 hours of publishing!**

```bash
npm unpublish regen-koi-mcp@1.0.0
```

After 72 hours, you can only deprecate:

```bash
npm deprecate regen-koi-mcp@1.0.0 "Reason for deprecation"
```

## User Experience After Publishing

Once published, users can use the package with:

```json
{
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
```

**Automatic Updates:**
- Every time Claude Desktop/Code restarts, `npx` checks for new versions
- Users automatically get the latest tools
- No manual `git pull` or rebuild needed!

## Troubleshooting

### "Package name too similar to existing package"

If `regen-koi-mcp` is taken, try:
- `@regen-network/koi-mcp`
- `@gaiaai/regen-koi-mcp`
- `regen-network-koi-mcp`

### "You must verify your email"

```bash
# Check npm account
npm profile get
```

Verify email at https://www.npmjs.com/

### "402 Payment Required"

This means the package name is reserved. Choose a different name.

## Questions?

- npm documentation: https://docs.npmjs.com/
- MCP specification: https://modelcontextprotocol.io/
- Issues: https://github.com/gaiaaiagent/regen-koi-mcp/issues
