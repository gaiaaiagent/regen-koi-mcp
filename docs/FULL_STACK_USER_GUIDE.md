# Full Stack User Guide

> Get an AI assistant with full awareness of Regen tech systems in 5 minutes.

**What is "Full Stack"?** Two MCP servers working together:
- **KOI MCP** → Knowledge (48K+ docs, 31K+ code entities, internal Notion)
- **Ledger MCP** → On-chain state (balances, proposals, credits)

---

## 1. Install (30 seconds)

**Claude Code CLI:** (recommended)
```bash
claude mcp add regen-koi npx regen-koi-mcp@latest
```

**Other clients:**
| Client | Install Command |
|--------|-----------------|
| Warp | `/add-mcp regen-koi npx -y regen-koi-mcp@latest` |
| VS Code (Cline/Continue) | Add to MCP config - see [main README](../README.md) |
| Cursor | Add to MCP config |
| Claude Desktop | Add to `claude_desktop_config.json` |

**Optional - Add Ledger MCP for on-chain queries:**
```bash
claude mcp add regen-ledger npx @anthropic/regen-ledger-mcp@latest
```

---

## 2. Verify It Works (1 minute)

Start a new Claude Code session and ask:

```
What repositories are indexed in KOI?
```

**Expected:** A list of 8 repositories including `regen-ledger`, `regen-web`, etc.

If you see this, you're ready to go.

---

## 3. Quick Test Prompts

### Basic knowledge retrieval:
```
What is the Registry Agent? Use KOI search to find documentation.
```

### Code navigation:
```
Use query_code_graph to find the MsgRetire message implementation.
Show me the file path and explain what it does.
```

### Grounded technical brief:
```
Explain how ecocredit baskets work, with code pointers to x/ecocredit/basket.
Include a Sources section citing where you found each piece of information.
```

### On-chain queries (requires Ledger MCP):
```
What's the current balance in the Regen community pool?
```

### Combined full-stack query:
```
Find documentation about credit retirement, then check how many credits
have been retired on-chain. Compare what the docs say vs actual usage.
```

---

## 4. Access Private Docs (Optional)

If you have a @regen.network email and want to access internal Notion:

```
Can you authenticate me to access private Regen docs?
```

This opens a browser for Google OAuth. After authenticating, you can search internal documentation.

---

## 5. What You Can Do

| Capability | Tool | Example Query |
|------------|------|---------------|
| Search docs/forum/Notion | `search` | "Registry Agent responsibilities" |
| Navigate codebase | `query_code_graph` | "Find MsgCreateBatch implementation" |
| Search GitHub docs | `search_github_docs` | "validator upgrade guide" |
| Weekly ecosystem digest | `generate_weekly_digest` | "What happened last week?" |
| Entity resolution | `resolve_entity` | "Find info about Gregory Landua" |
| On-chain balances | Ledger: `get_balance` | "What's in the community pool?" |
| Governance proposals | Ledger: `list_governance_proposals` | "Show active proposals" |
| Credit class info | Ledger: `list_classes` | "List all credit classes" |

---

## 6. The Value-Add

**Why use KOI instead of just Claude Code reading files?**

Claude Code can read local repos. KOI provides access to everything else:

| Source | Claude Code Alone | With KOI |
|--------|-------------------|----------|
| Local code files | ✅ | ✅ |
| Forum discussions | ❌ | ✅ |
| Internal Notion | ❌ | ✅ (with auth) |
| Telegram/Discord | ❌ | ✅ |
| Medium articles | ❌ | ✅ |
| Podcast transcripts | ❌ | ✅ |
| Live on-chain state | ❌ | ✅ (with Ledger MCP) |

**Example:** "Why was basket functionality designed this way?"
- Claude Code alone: Can read the code, but can't explain the rationale
- With KOI: Finds RFC 002, forum discussions, design decisions

---

## 7. Share Feedback

After testing, share your experience:

```
Submit feedback: I tried searching for Registry Agent and it worked great. Rating 5.
```

Or if something didn't work:

```
Submit feedback: The search for "basket tokens" returned no results. Rating 2, category bug.
```

Your feedback is stored and helps improve the system.

---

## 8. Troubleshooting

### "Tool not found" or "MCP not connected"
- Restart Claude Code / your client
- Check install: `claude mcp list` should show `regen-koi`

### "Authentication required"
- Some features (private docs, metrics) need OAuth
- Ask "Can you authenticate me?" to start the flow

### Slow responses
- First query may take 5-10 seconds (cold start)
- Subsequent queries should be faster

### Empty search results
- Try broader search terms
- Check spelling
- Use `get_stats` to see what sources are indexed

---

## 9. More Resources

| Resource | Description |
|----------|-------------|
| [USER_GUIDE.md](./USER_GUIDE.md) | Comprehensive reference for all tools |
| [API_REFERENCE.md](./API_REFERENCE.md) | Detailed API documentation |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | OAuth setup for private docs |
| [GitHub Issues](https://github.com/gaiaaiagent/regen-koi-mcp/issues) | Report bugs, request features |

---

## Current Stats

| Metric | Value |
|--------|-------|
| Documents indexed | 48,000+ |
| Code entities | 31,728 |
| Repositories | 8 |
| Data sources | 12 (GitHub, Discourse, Notion, Telegram, etc.) |

*Last updated: January 2026*
