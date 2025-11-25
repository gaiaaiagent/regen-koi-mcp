# GitHub Sensor RID Generation Fix

## Problem

The sensor was generating RIDs that included the temp directory path, causing duplicates:

**Bad RID (with temp dir):**
```
regen.github:github_regen-ledger_github_sensor_18f2y37p_regen-ledger_CODE_OF_CONDUCT.md
```

**Good RID (clean):**
```
regen.github:github_regen-ledger_CODE_OF_CONDUCT.md
```

This caused:
- Every sensor run to create new RIDs even for unchanged files
- Database to fill with duplicate content
- Only 6 files being truly "new" in the second run (all others were duplicates)

## Root Cause

Line 327 of `github_sensor.py` was calculating relative_path incorrectly:
```python
# OLD (WRONG):
relative_path = file_path.relative_to(file_path.parent.parent.parent)

# This included the temp directory structure in the path
```

## Fix Applied

1. **Updated method signature** (`github_sensor.py:291`):
   - Added `repo_path: Path` parameter to `process_file()`

2. **Updated method call** (`github_sensor.py:220`):
   - Pass `repo_path` when calling `process_file()`

3. **Fixed RID generation** (`github_sensor.py:328`):
   ```python
   # NEW (CORRECT):
   relative_path = file_path.relative_to(repo_path)

   # Now uses the cloned repo root as the reference point
   ```

## Files Modified

- `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/github_sensor.py` (lines 220, 291, 328)

## Expected Results After Fix

- RIDs will be consistent across runs
- Files with same content won't be reindexed
- Database will properly deduplicate using content hashes
- All 810 unique files will appear in database on first clean run

## Test Plan

1. **Clear old data**:
   ```sql
   DELETE FROM koi_memories WHERE metadata->>'parent_rid' LIKE '%github_sensor_%';
   ```

2. **Run sensor**:
   ```bash
   cd /Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github
   source venv/bin/activate
   export PYTHONPATH="/Users/darrenzal/projects/RegenAI/koi-sensors:$PYTHONPATH"
   python3 test_config.py
   ```

3. **Verify RIDs**:
   ```sql
   SELECT metadata->>'parent_rid' FROM koi_memories LIMIT 5;
   -- Should NOT contain "github_sensor_" temp directory
   ```

4. **Check counts**:
   ```sql
   SELECT COUNT(DISTINCT metadata->>'parent_rid') FROM koi_memories;
   -- Should be ~810 files
   ```

## Status

✅ Fix implemented
⏳ Testing pending
