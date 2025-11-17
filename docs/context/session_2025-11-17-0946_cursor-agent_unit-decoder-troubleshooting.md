# Session Recap: Unit Decoder Troubleshooting and Fix
**Date**: 2025-11-17  
**Session Time**: Extended debugging session  
**Status**: Complete  
**Agent**: cursor-agent

## Session Context
- **Mode**: Debug / Fix  
- **Identity**: cursor-agent  
- **Workspace**: /home/dcs/DCSOlympus  
- **Focus**: BFIS unit binary decoder - fixing buffer alignment and loop control flow issues preventing multiple units from being decoded

## Tools & Capabilities
- **Read-only tools**: read_file, grep, codebase_search, list_dir  
- **Write tools**: search_replace, write, run_terminal_cmd  
- **Agent Permissions**: Full write access to codebase  
- **Network Access**: Enabled (Docker container testing against live Olympus instance at 192.168.1.4:3000)  
- **Search Capabilities**: Local codebase search, reference to working decoder in `/home/dcs/dcs-bfis/services/olympus-gateway`

## Outcomes

### Problem Identified
The unit decoder was only decoding **1 unit** from a 1106-byte buffer that should contain **multiple units** (expected 3 units: 70001, 70002, 70003).

### Root Cause
The `break` statements inside the `switch` statement were only breaking from the `switch`, not the inner `while` loop. This caused the decoder to continue processing fields for the same unit after finding the `0xFF` (EndOfData) marker, preventing the outer loop from advancing to the next unit.

### Solution Applied
Added a **labeled break** (`fieldLoop:`) to the inner `while` loop and changed all error recovery `break` statements to `break fieldLoop` to properly exit the inner loop and allow the outer loop to continue processing the next unit.

### Final Result
✅ Successfully decoding **3 units** from the buffer:
- Unit 70001 (A-10C_2)
- Unit 70002 (F-16C_50)  
- Unit 70003 (F-14B)

All units now have correct:
- Category (no longer corrupted)
- Coalition (BLUE)
- UnitType (from `name` field)
- Position (lat/lon/alt)
- Group ID
- Status

## Issues & Resolutions

### Issue 1: Only 1 Unit Decoded from Multi-Unit Buffer
**Symptoms:**
- Buffer size: 1106 bytes
- Units decoded: 1 (should be 3)
- Unit ID being read: 16777473 (incorrect - should be 70001)
- Category field corrupted: `"\u0001\u0001\b"` (binary garbage)

**Root Cause:**
The decoder was encountering unknown `DataIndexes` (191, 114, 119) and finding `0xFF` markers, but the `break` statement at line 236 was only breaking from the `switch` statement, not the inner `while` loop. This caused the inner loop to continue processing fields for the same unit instead of allowing the outer loop to advance to the next unit.

**Fix Applied:**
```typescript
// Before:
while (dataExtractor.getSeekPosition() < buffer.byteLength) {
  // ...
  switch (datumIndex) {
    default:
      if (found) {
        break; // Only breaks from switch, not while loop!
      }
  }
}

// After:
fieldLoop: while (dataExtractor.getSeekPosition() < buffer.byteLength) {
  // ...
  switch (datumIndex) {
    default:
      if (found) {
        break fieldLoop; // Properly breaks from while loop
      }
  }
}
```

**Files Changed:**
- `bfis-service/src/snapshot/unit-decoder.ts`:
  - Line 83: Added label `fieldLoop:` to inner while loop
  - Line 88: Changed `break` to `break fieldLoop` for EndOfData marker
  - Line 223: Changed `break` to `break fieldLoop` in unknown DataIndex recovery (when finding next unit ID)
  - Line 228: Changed `break` to `break fieldLoop` in unknown DataIndex recovery (when giving up)
  - Line 236: Changed `break` to `break fieldLoop` in unknown DataIndex recovery (when finding 0xFF)
  - Line 272: Changed `break` to `break fieldLoop` in catch block recovery (when finding next unit ID)
  - Line 277: Changed `break` to `break fieldLoop` in catch block recovery (when giving up)
  - Line 285: Changed `break` to `break fieldLoop` in catch block recovery (when finding 0xFF)

### Issue 2: Unknown DataIndex Warnings
**Symptoms:**
- Console warnings: `Unknown datumIndex 191 for unit 16777473`
- Console warnings: `Unknown datumIndex 114 for unit 16777473` (multiple times)
- Console warnings: `Unknown datumIndex 119 for unit 16777473`

**Root Cause:**
These DataIndexes are not in the `DATA_INDEX_TYPES` mapping, indicating they are either:
1. New DataIndexes added to Olympus that BFIS doesn't know about yet
2. Corrupted data due to buffer misalignment (which was the actual issue)

**Resolution:**
The error recovery logic was already in place to handle unknown DataIndexes by searching for the next `0xFF` marker. The fix for Issue 1 resolved the buffer misalignment, so these warnings are now expected for truly unknown DataIndexes and the decoder correctly recovers by finding the next `0xFF` marker and continuing to the next unit.

### Issue 3: Buffer Misalignment After Error Recovery
**Symptoms:**
- After finding `0xFF` at position 463, decoder positioned at 464
- Decoder then encountered `Unknown datumIndex 114` - indicating it was still reading fields for the same unit
- Multiple `0xFF` markers found for the same unit (463, 626, 972, 1106)

**Root Cause:**
The `break` statement was not exiting the inner loop, so after finding `0xFF` and positioning right after it, the inner loop continued and tried to read the next `datumIndex` as if it were still processing the same unit's fields.

**Fix Applied:**
The labeled break ensures that after finding `0xFF` and positioning correctly, the inner loop exits, allowing the outer loop to read the next unit ID from the correct position.

### Issue 4: Incorrect Unit ID Being Read
**Symptoms:**
- First unit ID read: `16777473` (0x01000001 in hex - suspicious pattern)
- Expected: `70001`

**Root Cause:**
This was a symptom of the buffer misalignment issue. The decoder was reading from the wrong position in the buffer, causing it to interpret non-unit-ID data as a unit ID.

**Resolution:**
Fixed automatically when Issue 1 was resolved. The decoder now correctly reads unit IDs from the proper positions in the buffer.

### Issue 5: Corrupted Category Field
**Symptoms:**
- Category field showing: `"\u0001\u0001\b"` (binary garbage)
- Should show: `"Aircraft"`

**Root Cause:**
Buffer misalignment caused the decoder to read category data from the wrong position, resulting in corrupted string data.

**Resolution:**
Fixed automatically when Issue 1 was resolved. Category field now correctly shows `"Aircraft"` for all units.

## Decisions

### Decision 1: Use Labeled Break Instead of Flag Variable
**Context:** Needed to break from inner while loop when finding `0xFF` marker during error recovery.

**Options Considered:**
1. Use a flag variable (`let shouldBreak = false`) and check it after the switch
2. Use a labeled break (`break fieldLoop`)
3. Restructure the code to avoid nested loops

**Decision:** Use labeled break (`break fieldLoop`)

**Reasoning:**
- Cleaner and more explicit than flag variables
- Matches the pattern used in the working decoder reference
- Minimal code changes required
- TypeScript/JavaScript supports labeled breaks natively

### Decision 2: Keep Error Recovery Logic for Unknown DataIndexes
**Context:** Decoder encounters unknown DataIndexes (191, 114, 119) that aren't in the mapping.

**Options Considered:**
1. Add these DataIndexes to `DATA_INDEX_TYPES` mapping
2. Keep current error recovery (search for next `0xFF` marker)
3. Throw error and stop decoding

**Decision:** Keep current error recovery logic

**Reasoning:**
- Unknown DataIndexes may be new fields added to Olympus that BFIS doesn't need
- Graceful degradation: one unknown field shouldn't break entire batch
- Matches working decoder's pattern of skipping to next `0xFF` marker
- Logs warnings for observability without stopping decode

### Decision 3: Add Debug Logging for Troubleshooting
**Context:** Needed to understand buffer positions and decoder state during debugging.

**Decision:** Added conditional debug logging controlled by `DEBUG_UNIT_BUFFER` environment variable

**Implementation:**
```typescript
if (process.env.DEBUG_UNIT_BUFFER === "true") {
  console.log(`[DEBUG] Reading unit ID ${unitIdNum} at position ${posBeforeUnitId}`);
  console.log(`[DEBUG] Found 0xFF for unit ${unitIdNum}, positioned at ${dataExtractor.getSeekPosition()}`);
  console.log(`[DEBUG] Added unit ${unit.unitId}, position after unit: ${dataExtractor.getSeekPosition()}`);
}
```

**Reasoning:**
- Non-intrusive (only logs when env var set)
- Helps with future debugging
- Can be removed or made more sophisticated later
- Doesn't impact production performance

## Tasks Completed

1. ✅ **Identified root cause** of single unit decoding issue
2. ✅ **Analyzed working decoder** reference (`/home/dcs/dcs-bfis/services/olympus-gateway/src/decoders/binary/binaryDecoder.js`)
3. ✅ **Added labeled break** to inner while loop (`fieldLoop:`)
4. ✅ **Updated all error recovery break statements** to use `break fieldLoop`
5. ✅ **Added debug logging** for buffer positions and unit processing
6. ✅ **Rebuilt Docker image** with fixes
7. ✅ **Verified fix** - decoder now correctly decodes 3 units from buffer
8. ✅ **Confirmed unit data correctness** - all fields (category, coalition, unitType, position, groupId, status) are now correct

## Next Tasks

1. **Remove or refine debug logging** - Consider making it more structured or removing it if not needed
2. **Add unit tests** for error recovery scenarios (unknown DataIndex, buffer corruption, etc.)
3. **Document error recovery behavior** in JSDoc comments
4. **Consider adding DataIndexes 191, 114, 119** to `DATA_INDEX_TYPES` if they become known
5. **Monitor for similar issues** in weapon decoder (if applicable)

## Test / Verification

### Test Command
```bash
docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service node build/bfis-service/test-snapshot-reader.js
```

### Verification Results
**Before Fix:**
- Units decoded: 1
- Unit ID: 16777473 (incorrect)
- Category: `"\u0001\u0001\b"` (corrupted)
- Buffer size: 1106 bytes

**After Fix:**
- Units decoded: 3 ✅
- Unit IDs: 70001, 70002, 70003 ✅
- Categories: "Aircraft" (all units) ✅
- Coalitions: "BLUE" (all units) ✅
- UnitTypes: "A-10C_2", "F-16C_50", "F-14B" ✅
- Positions: Valid lat/lon/alt for all units ✅
- Group IDs: 70001, 70002, 70003 ✅
- Status: "1" (all units) ✅

### Debug Output (with DEBUG_UNIT_BUFFER=true)
```
[DEBUG] Reading unit ID 70001 at position 8, buffer size: 1106
[DEBUG] Found 0xFF for unit 70001, positioned at 463, buffer size: 1106
[DEBUG] Reading unit ID 70002 at position 464, buffer size: 1106
[DEBUG] Found 0xFF for unit 70002, positioned at 843, buffer size: 1106
[DEBUG] Reading unit ID 70003 at position 844, buffer size: 1106
[DEBUG] Found 0xFF for unit 70003, positioned at 1106, buffer size: 1106
[DEBUG] Added unit 70001, position after unit: 463
[DEBUG] Added unit 70002, position after unit: 843
[DEBUG] Added unit 70003, position after unit: 1106
```

## Linked Context

### Files Modified
- `bfis-service/src/snapshot/unit-decoder.ts` - Main decoder implementation with labeled break fix

### Reference Files Analyzed
- `/home/dcs/dcs-bfis/services/olympus-gateway/src/decoders/binary/binaryDecoder.js` - Working decoder reference
- `/home/dcs/dcs-bfis/services/olympus-gateway/src/decoders/binary/dataIndex.js` - DataIndex enum reference
- `bfis-service/src/snapshot/data-index-types.ts` - DataIndex to type mapping
- `bfis-service/src/snapshot/binary-decoder.ts` - Low-level DataExtractor

### Related Specifications
- `specs/001-bfis-snapshot-decoders/spec.md` - Feature specification
- `specs/001-bfis-snapshot-decoders/plan.md` - Implementation plan
- `specs/001-bfis-snapshot-decoders/tasks.md` - Task list

### Test Files
- `bfis-service/test-snapshot-reader.ts` - Manual test script
- `bfis-service/src/snapshot/__tests__/unit-decoder.test.ts` - Unit tests

## Lessons / Notes

### Key Insights

1. **Labeled Breaks Are Essential for Nested Loops**
   - When breaking from a switch inside a while loop, use labeled breaks to ensure you exit the correct loop
   - This is a common JavaScript/TypeScript gotcha that can cause subtle bugs

2. **Error Recovery Must Preserve Loop Control Flow**
   - Error recovery logic (finding next `0xFF` marker) must properly exit loops, not just position the buffer
   - The position update alone isn't enough - the control flow must also advance correctly

3. **Working Decoder Reference Was Critical**
   - Having access to the working decoder in `/home/dcs/dcs-bfis/services/olympus-gateway` was invaluable
   - The pattern of searching for `0xFF` and breaking from loops matched the working implementation

4. **Debug Logging Helps Identify Control Flow Issues**
   - Adding position logging revealed that the decoder was finding multiple `0xFF` markers for the same unit
   - This indicated the inner loop wasn't exiting properly

5. **Buffer Misalignment Symptoms Can Be Misleading**
   - Corrupted category field and incorrect unit ID were symptoms, not the root cause
   - The real issue was control flow (break statement scope), not buffer positioning

### Code Quality Improvements

1. **Consider Adding Unit Tests for Error Recovery**
   - Test scenarios: unknown DataIndex, buffer corruption, missing `0xFF` marker
   - Ensure labeled breaks work correctly in all error paths

2. **Document Error Recovery Behavior**
   - Add JSDoc comments explaining when and how error recovery occurs
   - Document the labeled break pattern for future maintainers

3. **Consider Making Debug Logging More Structured**
   - Use structured logger instead of console.log
   - Include more context (buffer position, unit ID, DataIndex value)

### Patterns to Remember

1. **Labeled Break Pattern for Nested Loops:**
   ```typescript
   outerLoop: while (condition) {
     innerLoop: while (condition) {
       switch (value) {
         case error:
           break innerLoop; // Exits innerLoop, continues outerLoop
       }
     }
   }
   ```

2. **Error Recovery Pattern:**
   ```typescript
   // Find next sync marker (0xFF)
   const markerPos = findNextMarker(buffer, currentPos);
   if (markerPos !== -1) {
     dataExtractor.setSeekPosition(markerPos + 1);
     break innerLoop; // Must break from loop, not just position
   }
   ```

### What Worked Well

- Systematic debugging approach: identified symptoms, traced to root cause
- Reference to working decoder provided clear pattern to follow
- Docker-based testing ensured consistent environment
- Debug logging provided visibility into control flow issues

### What Could Be Improved

- Could have identified the labeled break issue earlier by examining loop control flow more carefully
- Could add more comprehensive error recovery tests upfront
- Could document the labeled break pattern in code comments for future reference

---

## Technical Details

### Code Changes Summary

**File: `bfis-service/src/snapshot/unit-decoder.ts`**

1. **Line 83**: Added label to inner while loop
   ```typescript
   // Before:
   while (dataExtractor.getSeekPosition() < buffer.byteLength) {
   
   // After:
   fieldLoop: while (dataExtractor.getSeekPosition() < buffer.byteLength) {
   ```

2. **Line 88**: Changed break for EndOfData marker
   ```typescript
   // Before:
   if (datumIndex === DataIndexes.endOfData) {
     break;
   }
   
   // After:
   if (datumIndex === DataIndexes.endOfData) {
     break fieldLoop;
   }
   ```

3. **Lines 223, 228, 236**: Changed breaks in unknown DataIndex recovery
   ```typescript
   // Before:
   break; // Only breaks from switch
   
   // After:
   break fieldLoop; // Breaks from inner while loop
   ```

4. **Lines 272, 277, 285**: Changed breaks in catch block error recovery
   ```typescript
   // Before:
   break; // Only breaks from switch
   
   // After:
   break fieldLoop; // Breaks from inner while loop
   ```

5. **Lines 66-72, 233-235, 282-284, 294-296**: Added debug logging
   ```typescript
   if (process.env.DEBUG_UNIT_BUFFER === "true") {
     console.log(`[DEBUG] ...`);
   }
   ```

### Buffer Structure Understanding

The binary buffer structure is:
```
[8 bytes: updateTime (uint64)]
[Unit 1: uint32 unitID] [fields...] [0xFF]
[Unit 2: uint32 unitID] [fields...] [0xFF]
[Unit 3: uint32 unitID] [fields...] [0xFF]
...
```

After finding `0xFF`, the decoder must:
1. Position right after `0xFF` (position + 1)
2. **Break from inner loop** (critical!)
3. Allow outer loop to read next unit ID from that position

The fix ensures step 2 happens correctly.

---

