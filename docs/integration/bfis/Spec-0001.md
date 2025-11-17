BFIS Snapshot Ingestion & Binary Decoding (MVP Spec)
1. Purpose & Scope
Goal: Define how BFIS reads battlefield state from Olympus, converts it into an internal snapshot, and prepares data for decision-making — without becoming a second source of truth.

This spec covers:

The SnapshotReader behavior for:
Authenticated HTTP calls to Olympus endpoints.
Polling strategy (timing + backoff).
Handling sessionHash changes.
Binary decoding responsibilities and interfaces:
DataExtractor for units/weapons buffers.
Internal data types used for decoded binary elements.
The shape and guarantees of the internal OlympusSnapshot (as BFIS sees it).
Logging and instrumentation responsibilities during ingestion.
Out of scope for this spec (handled in separate specs):

BFIS decision logic and BfisDecision structure.
Command adapter behavior (PUT /olympus, GET /olympus/commands).
NDJSON decision log schema details (these are already defined separately).
2. High-Level Behavior
2.1 Core loop (MVP)
At MVP, SnapshotReader is responsible for:

Initial probe

On service startup, perform a single authenticated GET /olympus/mission to:
Verify connectivity to Olympus.
Verify credentials and role (Game master initially).
Log success/failure via structured logger.
Polling

At configured intervals (from BfisConfig.polling), retrieve:
Units/weapons: binary endpoints (GET /olympus/units, GET /olympus/weapons).
Mission: GET /olympus/mission (JSON).
Logs: GET /olympus/logs?time={lastTime} (JSON).
Airbases, bullseyes, spots, drawings: JSON endpoints.
Use the time query parameter and response to support incremental updates where supported.
Snapshot construction

Combine the latest responses into an internal OlympusSnapshot object:
snapshotId, missionId, serverId, sessionHash, time.
units: decoded from units buffer.
events: initially derived from logs and/or diffing snapshots (optional in MVP).
OlympusSnapshot is read-only from BFIS’ perspective and reflects what Olympus last reported.
State & session handling

Track sessionHash from every Olympus response.
If sessionHash changes, treat it as:
A mission reset or new mission load.
Signal for BFIS to:
Clear any cached state and lastTime values.
Restart internal polling state (e.g., full refresh next tick).
Optionally log a bfis-session-reset event.
Error handling

On HTTP errors or decoding failures:
Log structured error events with enough context (URL, status, message).
Avoid crashing the process; instead:
Use simple retry/backoff (configurable later).
Let the container healthcheck surface repeated failures.
3. Inputs
3.1 Configuration
All configuration is loaded via loadConfig() in bfis-service/src/config/config.ts:

olympusFrontendBaseUrl: string
Typically http://192.168.1.4:3000 on the home rig.
olympusBaseUrl: string
Derived from frontend base URL (e.g., http://192.168.1.4:3000/olympus).
olympusAuth: { role, username, password }
role: "GAME_MASTER" | "BLUE_COMMANDER" | "RED_COMMANDER" | "ADMIN".
Username/password from /home/dcs/.creds/olympus_env.txt (primary) or env.
polling: PollingConfig
unitsMs (default 2000)
weaponsMs (default 2000)
logsMs (default 1000)
missionMs (default 5000)
airbasesMs, bullseyesMs (default 10000)
spotsMs (default 2000)
generalLogPath: string
Path for structured service logs (e.g., logs/bfis-service.log).
3.2 Olympus endpoints
From the ratified endpoint inventory:

Binary (units/weapons):
GET /olympus/units?time={t}
GET /olympus/weapons?time={t}
Payload: binary; first 8 bytes = updateTime (uint64, ms), remainder = data.
JSON:
Mission: GET /olympus/mission
Logs: GET /olympus/logs?time={t}
Airbases: GET /olympus/airbases
Bullseyes: GET /olympus/bullseyes
Spots: GET /olympus/spots
Drawings: GET /olympus/drawings
Common JSON fields: time, sessionHash, load, frameRate.
3.3 Auth & headers
Basic Auth: Authorization: Basic base64(username:password).
Role header: X-Command-Mode:
"Game master", "Blue commander", "Red commander", "Admin" mapped from olympusAuth.role via a helper.
4. Outputs
4.1 OlympusSnapshot (internal, but schema-driven)
The internal BFIS snapshot type will mirror shared-schemas/OlympusSnapshot, with some internal augmentations:

4.1.1 Shared schema core (to be implemented in shared-schemas/index.ts)
export interface OlympusUnitPosition {
  lat: number;
  lon: number;
  altMeters: number;
}

export type OlympusCoalition = "BLUE" | "RED" | "NEUTRAL" | "UNKNOWN";

export interface OlympusUnit {
  unitId: string;
  groupId?: string;
  name?: string;
  coalition: OlympusCoalition;
  /**
   * High-level category used by Olympus ("Aircraft", "Helicopter", "GroundUnit", "NavyUnit", etc.).
   */
  category: string;
  unitType: string;
  position: OlympusUnitPosition;
  status?: string;
}

export interface OlympusEvent {
  eventId: string;
  time: string;
  type: string;
  unitId?: string;
  details?: Record<string, unknown>;
}

export interface OlympusSnapshot {
  snapshotId: string;
  missionId: string;
  serverId: string;
  /**
   * Olympus session hash, used to detect mission restarts or resets.
   */
  sessionHash: string;
  time: string;
  units: OlympusUnit[];
  /**
   * Optional derived events, either from Olympus logs or BFIS snapshot diffing.
   */
  events?: OlympusEvent[];
}
4.1.2 BFIS SnapshotReader responsibilities
SnapshotReader must:

Produce a snapshot that:
Always includes a vector of OlympusUnit representing the current units view.
Carries sessionHash and time from the latest mission/log response.
Can be extended with events derived from:
/olympus/logs.
Differences between successive snapshots.
Not mutate or cache snapshots after creation (immutable snapshot objects passed downstream).
5. Interfaces & Modules
5.1 SnapshotReader
Location: bfis-service/src/snapshot/snapshot-reader.ts

Construction:

export class SnapshotReader {
  constructor(config: BfisConfig, logger?: StructuredLogger);
}
config: BfisConfig from loadConfig().
logger?: StructuredLogger from createStructuredLogger().
Responsibilities:

Startup probe

probeMissionOnce(): Promise<void>
Performs GET {olympusBaseUrl}/mission with Basic Auth + X-Command-Mode.
On success: logger.info("bfis-olympus-probe-ok", { url, status }).
On failure: throws error; caller logs bfis-olympus-probe-error.
Polling API (MVP shape, can be expanded):

async readOnce(): Promise<OlympusSnapshot>;
Fetches all relevant endpoints once, in this order:
mission
units (binary)
weapons (binary)
logs
airbases, bullseyes, spots, drawings
Uses internal lastTime state for time query params on units/weapons/logs.
Updates lastTime values from the time fields in responses and the leading uint64 in binary buffers.
Session & state:

Maintains:
lastSessionHash: string | null
lastTimes: { [endpoint: string]: number } (units, weapons, logs).
On readOnce():
If sessionHash differs from lastSessionHash:
Reset lastTimes (forcing full refresh on next poll).
Optionally log bfis-session-reset.
Generate a new snapshotId independent of previous snapshots.
Error behavior:

Any failed HTTP request:
Logs bfis-snapshot-http-error with URL, status, message.
Throws or returns a partial snapshot depending on severity (MVP: throw, let caller decide).
Any decode error (binary or JSON):
Logs bfis-snapshot-decode-error with minimal context.
Throws; BFIS can retry on next poll.
Logging:

For every readOnce() call:
On success: log bfis-snapshot-read-ok with snapshotId, sessionHash, unitCount.
On failure: error event as above.
5.2 DataExtractor & internal types
Location: bfis-service/src/snapshot/binary-decoder.ts, bfis-service/src/types/internal.ts

DataExtractor is an internal utility; its API is:

export class DataExtractor {
  constructor(buffer: ArrayBuffer);

  setSeekPosition(seekPosition: number): void;
  getSeekPosition(): number;

  extractBool(): boolean;
  extractUInt8(): number;
  extractUInt16(): number;
  extractUInt32(): number;
  extractUInt64(): bigint;
  extractFloat64(): number;
  extractString(length?: number): string;
  extractChar(): string;

  extractLatLng(): BfisLatLng;
  extractTacan(): BfisTacan;
  extractRadio(): BfisRadio;
  extractGeneralSettings(): BfisGeneralSettings;
  extractAmmo(): BfisAmmo[];
  extractContacts(): BfisContact[];
  extractActivePath(): BfisLatLng[];
  extractOffset(): BfisOffset;
  extractDrawingArgument(): BfisDrawingArgument;
  extractDrawingArguments(): BfisDrawingArgument[];
}
And internal types (mirroring Olympus):

export interface BfisLatLng {
  lat: number;
  lng: number;
  alt: number;
  threshold?: number;
}

export interface BfisTacan { /* ... */ }
export interface BfisRadio { /* ... */ }
export interface BfisGeneralSettings { /* ... */ }
export interface BfisAmmo { /* ... */ }
export interface BfisContact { /* ... */ }
export interface BfisOffset { /* ... */ }
export interface BfisDrawingArgument { /* ... */ }
Usage:

SnapshotReader will create a DataExtractor from the binary buffer, read the leading uint64 updateTime, then:
Loop over units/weapons data, passing the extractor to per‑entity decoders (to be defined in the next spec).
This spec guarantees that DataExtractor semantics match Olympus; any changes to Olympus’ binary format must be mirrored here.
6. Polling Strategy (MVP defaults)
From the integration strategy:

Units/weapons (binary):
Default interval: 2000ms (configurable).
Every N polls (or on session reset), force time=0 full refresh.
Logs:
Default interval: 1000ms.
Always use time=lastLogsTime with time=0 fallback on reset.
Mission/airbases/bullseyes/spots/drawings:
Mission: default 5000ms, or slower if desired.
Others: 5000–10000ms.
The spec does not lock the exact scheduling implementation, but requires:

Poll intervals come from BfisConfig.polling.
sessionHash changes trigger:
Reset of internal lastTime values.
At least one full refresh (i.e., time=0) on units/weapons/logs.
7. Logging & NDJSON Hooks
7.1 Structured logger
All snapshot-related operations must use the structured logger:

On startup probe:
bfis-olympus-probe-ok or bfis-olympus-probe-error.
On each readOnce():
bfis-snapshot-read-ok (success).
bfis-snapshot-http-error / bfis-snapshot-decode-error (failures).
bfis-session-reset when sessionHash changes.
Fields should follow the established pattern:

ts, level, event, plus relevant metadata (url, status, snapshotId, sessionHash, unitCount).
7.2 NDJSON decision logs
This spec only defines hooks for NDJSON logging:

Snapshot ingestion itself does not write NDJSON.
The decision loop (separate spec) will consume OlympusSnapshot and:
Produce BfisDecision.
Log NDJSON with snapshot metadata (e.g., counts, snapshotId, sessionHash).
The contract here is that SnapshotReader exposes enough information (IDs, sessionHash, basic counts) so that NDJSON logs can describe which snapshot a decision was based on, without embedding the full snapshot body.

8. Error & Edge Cases
Mission resets (sessionHash changes):
Must be detected and logged.
Internal state (lastTime, caches) must reset.
Auth failures (401/403):
Logged with status and hint to check /home/dcs/.creds/olympus_env.txt.
Implementation may:
Retry with backoff, and/or
Signal failure via container healthcheck (out of scope here).
Network failures/timeouts:
Logged as bfis-snapshot-http-error.
No crash; BFIS should keep attempting on next poll cycles.
Binary decode errors:
Treated as serious; log and throw, so upstream can decide whether to restart or skip snapshot.
9. Testing & Instrumentation Expectations
Logging tests:
SnapshotReader tests should:
Assert that bfis-olympus-probe-ok is emitted on a successful probe.
Assert that bfis-snapshot-read-ok includes a snapshotId, sessionHash, and unitCount.
Binary decoder tests:
Synthetic buffers mirroring known Olympus patterns must be used to:
Verify extractUInt*, extractString, extractLatLng, etc.
Ensure DataExtractor behavior matches frontend/Python expectations.
Session reset tests:
Simulate change in sessionHash between two mission responses.
Assert that:
bfis-session-reset is logged.
lastTimes are reset (full refresh on next binary/log call).
All tests should follow the wireframe pattern:

Co-located under bfis-service/src/snapshot/__tests__/... and bfis-service/src/config/__tests__/....
Use structured asserts rather than ad-hoc prints.
Avoid placing tests in repo root.
This spec should be enough for you to feed into Speckit: it defines the responsibilities, APIs, and behavior of SnapshotReader and DataExtractor for MVP, connects them to the existing config/logging infrastructure, and leaves room for the decision loop spec to plug in later.