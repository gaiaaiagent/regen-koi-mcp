# GitHub Sensor Session Fix

## Problem Identified

**Root Cause:** KOI node HTTP session was not properly maintained during document broadcasting, causing all 810 events to fail with `No active session for broadcasting`.

## Changes Made

### 1. Enhanced Session Management (`github_sensor.py`)
Added session validation and automatic reinitialization in `send_to_koi()` method:

```python
# Ensure KOI node session is active
if not self.koi_node.session or self.koi_node.session.closed:
    self.logger.warning("KOI node session not active, reinitializing...")
    import aiohttp
    if self.koi_node.session and not self.koi_node.session.closed:
        await self.koi_node.session.close()
    self.koi_node.session = aiohttp.ClientSession()
    self.logger.info("KOI node session reinitialized")
```

**Benefits:**
- Automatically recreates session if missing or closed
- Prevents silent failures from "No active session" errors
- Adds diagnostic logging for debugging

### 2. Improved Test Script (`test_config.py`)
Added session verification after node startup:

```python
# Give the session a moment to fully initialize
await asyncio.sleep(1)
print(f"KOI node session active: {sensor.koi_node.session is not None}")
```

**Benefits:**
- Verifies session was created successfully
- Provides early warning if session initialization fails
- Adds 1-second buffer for async initialization

## Expected Results

### Before Fix:
- 810 files discovered
- 0 successfully sent (all failed with "No active session")
- Only 240 files in database from previous partial run

### After Fix:
- 810 files discovered
- 810 successfully sent ✅
- **643 Go files** indexed (vs 173 before)
- **43 Proto files** indexed (vs 0 before)
- **~810 unique files** in database (vs 240 before)

## How to Test

```bash
cd /Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github

# Ensure all services running:
# - KOI Coordinator (port 8005)
# - Event Bridge (port 8100)
# - BGE Server (port 8090)
# - Event Forwarder

# Run the test
source venv/bin/activate
export PYTHONPATH="/Users/darrenzal/projects/RegenAI/koi-sensors:$PYTHONPATH"
python3 test_config.py > test_output.log 2>&1

# Check results
grep "Successfully sent" test_output.log
grep "No active session" github_sensor_test.log | wc -l  # Should be 0
```

## Verification Queries

```sql
-- Check total unique files
SELECT COUNT(DISTINCT metadata->>'parent_rid') FROM koi_memories;
-- Expected: ~810 (up from 240)

-- Check Go files
SELECT COUNT(DISTINCT metadata->>'parent_rid') FROM koi_memories
WHERE metadata->>'parent_rid' LIKE '%.go%';
-- Expected: ~643 (up from 173)

-- Check Proto files
SELECT COUNT(DISTINCT metadata->>'parent_rid') FROM koi_memories
WHERE metadata->>'parent_rid' LIKE '%.proto%';
-- Expected: ~43 (up from 0)
```

## Next Steps

1. **Test the fix** - Run test_config.py and verify all 810 files are sent
2. **Check database** - Verify file counts match expectations
3. **Index remaining repos** - Run for regen-web, regen-data-standards, regenie-corpus
4. **Generate embeddings** - Add OpenAI API key and generate embeddings
5. **Test MCP queries** - Query the indexed codebase via MCP tools
