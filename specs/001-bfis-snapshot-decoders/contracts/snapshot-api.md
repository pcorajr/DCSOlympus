# SnapshotReader API Contract

**Date**: 2025-11-16  
**Feature**: 001-bfis-snapshot-decoders  
**Component**: `bfis-service/src/snapshot/snapshot-reader.ts`

## Overview

This document defines the public API contract for `SnapshotReader`, the component responsible for polling Olympus endpoints and constructing normalized snapshots.

## Class: SnapshotReader

### Constructor

```typescript
constructor(config: BfisConfig, logger?: StructuredLogger)
```

**Parameters**:
- `config: BfisConfig` - BFIS configuration containing Olympus URLs, auth, and polling intervals
- `logger?: StructuredLogger` - Optional structured logger for snapshot operations

**Behavior**:
- Initializes internal state: `lastSessionHash = null`, `lastTimes = {}`
- Stores config and logger for use in polling operations

**Throws**: Never throws (constructor only stores references)

---

### Method: probeMissionOnce

```typescript
probeMissionOnce(): Promise<void>
```

**Purpose**: Performs a single authenticated GET against `/olympus/mission` to verify connectivity and credentials.

**Parameters**: None

**Returns**: `Promise<void>` - Resolves on success, rejects on failure

**Behavior**:
1. Constructs URL: `{olympusBaseUrl}/mission`
2. Creates Basic Auth header from `config.olympusAuth`
3. Adds `X-Command-Mode` header based on role
4. Performs GET request
5. On success: logs `bfis-olympus-probe-ok` with `{ url, status }`
6. On failure: throws Error with status and message

**Logging**:
- Success: `logger.info("bfis-olympus-probe-ok", { url, status })`
- Failure: Caller logs `bfis-olympus-probe-error` (this method throws)

**Throws**:
- `Error` if HTTP request fails (network error, auth failure, etc.)
- Error message format: `"Olympus mission probe failed: {status} {statusText} {responseBody}"`

**Example**:
```typescript
const reader = new SnapshotReader(config, logger);
try {
  await reader.probeMissionOnce();
  // Probe successful
} catch (err) {
  // Handle probe failure
}
```

---

### Method: readOnce

```typescript
readOnce(): Promise<OlympusSnapshot>
```

**Purpose**: Fetches all relevant Olympus endpoints once, decodes binary data, and constructs a normalized snapshot.

**Parameters**: None

**Returns**: `Promise<OlympusSnapshot>` - Resolves with complete snapshot, rejects on any failure

**Behavior**:
1. Fetches endpoints in specified order (FR-016):
   - `GET /olympus/mission` (JSON)
   - `GET /olympus/units?time={lastTime}` (Binary)
   - `GET /olympus/weapons?time={lastTime}` (Binary)
   - `GET /olympus/logs?time={lastTime}` (JSON)
   - `GET /olympus/airbases` (JSON)
   - `GET /olympus/bullseyes` (JSON)
   - `GET /olympus/spots` (JSON)
   - `GET /olympus/drawings` (JSON)

2. After each fetch:
   - Checks session hash (if JSON response includes it)
   - If session hash differs from `lastSessionHash`:
     - Aborts current poll immediately (FR-008a)
     - Resets `lastTimes = {}`
     - Logs `bfis-session-reset`
     - Throws error to trigger retry

3. Decodes binary buffers:
   - Extracts leading `uint64` updateTime (first 8 bytes)
   - Decodes units using `DataExtractor` + unit decoder
   - Decodes weapons using `DataExtractor` + weapon decoder

4. Constructs `OlympusSnapshot`:
   - Generates UUID v4 `snapshotId`
   - Combines mission data + decoded units + optional events
   - Sets `sessionHash` and `time` from latest JSON response

5. Updates internal state:
   - `lastSessionHash = snapshot.sessionHash`
   - `lastTimes.units = units updateTime`
   - `lastTimes.weapons = weapons updateTime`
   - `lastTimes.logs = logs response time`

6. Logs success: `bfis-snapshot-read-ok` with `{ snapshotId, sessionHash, unitCount, unitsBufferSize, weaponsBufferSize }`

**Time Query Parameters**:
- Uses `lastTimes[endpoint]` for `time` query param (0 if not set, indicating full refresh)
- Updates `lastTimes` from response `time` fields and binary buffer leading `uint64`

**Session Hash Handling**:
- Tracks `lastSessionHash` from every JSON response
- On change: resets `lastTimes`, logs `bfis-session-reset`, throws error

**Error Handling**:
- Any HTTP error: logs `bfis-snapshot-http-error` with `{ url, status, message }`, throws error
- Any decode error: logs `bfis-snapshot-decode-error` with context, throws error
- Partial failures: entire snapshot fails (no partial snapshots returned) (FR-013)
- Empty data: valid snapshot but logs warning (FR-014a)

**Logging**:
- Success: `logger.info("bfis-snapshot-read-ok", { snapshotId, sessionHash, unitCount, unitsBufferSize, weaponsBufferSize })`
- Session reset: `logger.info("bfis-session-reset", { oldHash, newHash })`
- HTTP error: `logger.error("bfis-snapshot-http-error", { url, status, message })`
- Decode error: `logger.error("bfis-snapshot-decode-error", { endpoint, message })`
- Empty data warning: `logger.warn("bfis-snapshot-empty-data", { endpoint, snapshotId })`

**Throws**:
- `Error` if any endpoint fails (HTTP error, decode error, session hash change)
- Error message includes endpoint and failure reason

**Example**:
```typescript
const reader = new SnapshotReader(config, logger);
try {
  const snapshot = await reader.readOnce();
  // Use snapshot.units, snapshot.sessionHash, etc.
} catch (err) {
  // Handle error - retry on next poll cycle
}
```

---

## State Management

### Internal State

`SnapshotReader` maintains the following private state:

```typescript
private lastSessionHash: string | null = null;
private lastTimes: {
  units: number;
  weapons: number;
  logs: number;
} = {
  units: 0,
  weapons: 0,
  logs: 0
};
```

**State Transitions**:
- **Initial**: `lastSessionHash = null`, `lastTimes = { units: 0, weapons: 0, logs: 0 }`
- **After successful `readOnce()`**: `lastSessionHash` and `lastTimes` updated from responses
- **On session hash change**: `lastTimes` reset to `{ units: 0, weapons: 0, logs: 0 }` (forces full refresh)

---

## Error Contract

### Error Types

1. **HTTP Errors**: Network failures, authentication failures, server errors
   - Logged as: `bfis-snapshot-http-error`
   - Thrown as: `Error` with descriptive message

2. **Decode Errors**: Binary format corruption, unexpected data
   - Logged as: `bfis-snapshot-decode-error`
   - Thrown as: `Error` with context

3. **Session Hash Change**: Mission reset detected mid-poll
   - Logged as: `bfis-session-reset`
   - Thrown as: `Error` to trigger retry

### Error Handling Strategy

- **No automatic retries**: `readOnce()` throws on any error, caller handles retry timing
- **Fail-fast on partial failures**: Any endpoint failure causes entire snapshot to fail
- **No partial snapshots**: Either complete snapshot or error (FR-013)

---

## Logging Contract

### Structured Log Events

All log events follow the pattern: `{ ts, level, event, ...metadata }`

**Events**:
- `bfis-olympus-probe-ok`: Startup probe successful
- `bfis-olympus-probe-error`: Startup probe failed (logged by caller)
- `bfis-snapshot-read-ok`: Snapshot read successful
- `bfis-snapshot-http-error`: HTTP request failed
- `bfis-snapshot-decode-error`: Binary/JSON decode failed
- `bfis-session-reset`: Session hash changed
- `bfis-snapshot-empty-data`: Empty data received (warning)

**Required Metadata**:
- `bfis-snapshot-read-ok`: `snapshotId`, `sessionHash`, `unitCount`, `unitsBufferSize`, `weaponsBufferSize` (FR-012, FR-014b)

---

## Performance Contract

### Timing Guarantees

- **Startup probe**: < 5 seconds (SC-001)
- **Poll cycle**: < 3 seconds (SC-002)
- **Session hash detection**: < polling interval latency (SC-004)

### Resource Usage

- **Memory**: O(n) where n = number of units/weapons (no caching beyond current snapshot)
- **Network**: Sequential requests (no parallel fetching)
- **CPU**: Binary decoding is O(n) where n = buffer size

---

## Thread Safety

**Not thread-safe**: `SnapshotReader` is designed for single-threaded Node.js execution. Multiple instances can be created for concurrent polling if needed, but each instance maintains its own state.

---

## Versioning

**API Version**: 1.0 (MVP)  
**Breaking Changes**: None (initial API)  
**Future Extensions**: 
- Additional endpoints may be added to `readOnce()`
- Additional snapshot fields may be added (e.g., `events` array)
- Polling strategy may be made configurable per-endpoint

