BFIS Context Snapshot (MVP Spec)

1. Purpose & Scope

Goal: Extend BFIS’ “see the battlefield” capability from just mission + units to a richer, unified snapshot that also carries Olympus’ context data (airbases, bullseyes, spots, drawings, logs, and basic weapons state) as a single, consumable picture — without yet making decisions or inferring hostilities.

This spec covers:

- Extending the snapshot ingestion pipeline defined in spec-001 to:
  - Read and normalize non-unit context endpoints from Olympus.
  - Attach that context to a unified, internal “context snapshot” object.
- Minimal, deterministic normalization of raw JSON / binary responses into stable, typed structures under `bfis-service`.
- A simple, internal snapshot shape that downstream code (decider, summaries, LLM view builders) can consume.
- Logging and basic instrumentation specific to context ingestion (errors, empty data, size hints).

Out of scope for this spec (handled separately):

- BFIS decision logic and `BfisDecision` structure.
- Hostility / “player under attack” detection (weapons + logs interpretation).
- NDJSON decision logs and how snapshots are summarized for logging.
- LLM prompt/view formatting (full “LLM-ready” view is a later spec; this one ensures the raw data is available in a clean shape).

This spec builds directly on **spec-001 – BFIS Snapshot Ingestion & Binary Decoding** and assumes mission + units ingestion is already in place.

---

2. High-Level Behavior

2.1 Core behavior (context-aware snapshot)

At MVP, BFIS extends the existing snapshot ingestion loop so that **each successful poll produces a single internal “context snapshot”** that includes:

- Mission metadata (from `/olympus/mission`).
- Units (decoded from `/olympus/units` binary, as per spec-001).
- Context slices:
  - Airbases (`/olympus/airbases`).
  - Bullseyes (`/olympus/bullseyes`).
  - Spots (`/olympus/spots`).
  - Drawings (`/olympus/drawings`).
  - Logs (`/olympus/logs?time=...`).
  - Basic weapons state (from `/olympus/weapons` binary decoder).

Key behavior:

- On each poll, BFIS:
  - Fetches all relevant endpoints (mission, units, weapons, logs, airbases, bullseyes, spots, drawings) as in spec-001.
  - Passes the raw responses through small, deterministic normalizer functions.
  - Assembles a **single `BfisContextSnapshot`** object that represents “what Olympus reports right now” across all these dimensions.
- No new derived metrics or decisions are required in this spec; the goal is simply a **faithful, low-level and structured picture** with all available context in one place.

2.2 Session handling and consistency

Session handling builds on spec-001:

- `sessionHash` continues to be the authoritative indicator of mission resets.
- When `sessionHash` changes:
  - BFIS clears its internal caches (e.g., unit cache, lastTimes) as defined in spec-001.
  - Context slices for the new snapshot are treated as **fresh**, not merged with previous missions.
- For this spec, no additional cross-snapshot diffing is required:
  - Logs are still fetched incrementally via `time` query parameters.
  - The `BfisContextSnapshot` object represents only the *current* view (not history).

2.3 Error handling (context endpoints)

Error handling follows the same principles as spec-001:

- For each context endpoint:
  - On HTTP error, BFIS logs a structured `bfis-snapshot-http-error` with endpoint name and details, then fails the current poll (caller decides retry).
  - On parse/normalization error, BFIS logs `bfis-snapshot-decode-error` with endpoint context and error details, then fails the current poll.
- Empty or unusual data:
  - BFIS logs a structured warning (e.g., `bfis-snapshot-empty-data` or similar) when an endpoint returns an empty or obviously minimal payload (e.g., no airbases, no bullseyes, empty logs array), but still treats the snapshot as valid if other endpoints succeed.

This spec does not change global retry/backoff behavior; it only ensures context-specific failures are visible in logs.

---

3. Inputs

3.1 Configuration

BFIS reuses the configuration model from spec-001 (`BfisConfig` in `bfis-service/src/config/config.ts`):

- `olympusBaseUrl`, `olympusFrontendBaseUrl`, `olympusAuth` (role, username, password).
- Polling intervals for:
  - `airbasesMs`, `bullseyesMs`, `spotsMs`, `logsMs`, `missionMs`, `drawingsMs`, `weaponsMs`, `unitsMs`.
- General logging config:
  - `generalLogPath`, `logLevel`.

No new configuration values are required for this spec; context behavior respects existing polling intervals and logging paths.

3.2 Olympus endpoints (context focus)

The following endpoints, already defined in the integration strategy, are explicitly in scope:

- Mission:
  - `GET /olympus/mission` (JSON) – mission metadata, `time`, `sessionHash`.
- Units (from spec-001, included here for full context snapshot shape):
  - `GET /olympus/units?time={t}` (binary).
- Weapons (basic state only in this spec):
  - `GET /olympus/weapons?time={t}` (binary).
- Logs:
  - `GET /olympus/logs?time={t}` (JSON) – incremental via `time` parameter.
- Airbases:
  - `GET /olympus/airbases` (JSON).
- Bullseyes:
  - `GET /olympus/bullseyes` (JSON).
- Spots:
  - `GET /olympus/spots` (JSON).
- Drawings:
  - `GET /olympus/drawings` (JSON).

Auth and headers remain as in spec-001:

- Basic auth via `Authorization: Basic base64(username:password)`.
- `X-Command-Mode` header derived from `olympusAuth.role`.

---

4. Outputs

4.1 BfisContextSnapshot (internal)

This spec introduces an **internal** snapshot type used by BFIS for context-aware decision-making later. A conceptual shape (not necessarily exported from `shared-schemas` yet):

```ts
export interface BfisContextSnapshot {
  /** Core Olympus snapshot from shared schemas (mission + units + sessionHash + time). */
  base: OlympusSnapshot;

  /** Airbase context as a normalized list (subset of Olympus airbase JSON fields). */
  airbases: NormalizedAirbase[];

  /** Bullseye reference points per coalition / side. */
  bullseyes: NormalizedBullseye[];

  /** Current laser/IR spots and similar markers. */
  spots: NormalizedSpot[];

  /** Map drawings / annotations (e.g., zones, lines, labels). */
  drawings: NormalizedDrawing[];

  /** Recent logs slice representing what Olympus reported this tick. */
  logs: NormalizedLogEntry[];

  /** Basic weapons state for this moment (no hostility interpretation yet). */
  weaponsSummary: WeaponsSummary;
}
```

The *exact* shapes of the `Normalized*` types are intentionally minimal for this spec; they must:

- Preserve key identifiers and coordinates needed later (e.g., airbase ID, coalition, position; bullseye coordinates; spot positions; drawing geometry).
- Preserve enough metadata from logs to support future event derivation (e.g., timestamp, category, brief message/fields).
- Avoid duplicating every possible Olympus field; focus on what BFIS is likely to need for decisions and summaries.

4.2 WeaponsSummary (basic state only)

Weapons decoding is already defined in spec-001. For this spec, BFIS only needs **basic state**, not full hostilities logic. An example minimal shape:

```ts
export interface WeaponsSummary {
  /** Last update time from the weapons buffer (ms since epoch). */
  lastUpdateTime: number;
  /** Total number of active weapons currently tracked. */
  activeCount: number;
}
```

Internally, this can be derived from whatever the existing weapons decoder returns (e.g., count of entries, latest timestamp). Detailed per-weapon objects and “who is shooting whom” semantics are reserved for a later spec.

---

5. Interfaces & Modules

5.1 SnapshotReader extension

Location: `bfis-service/src/snapshot/snapshot-reader.ts`

SnapshotReader behavior is extended (not replaced) to support context snapshots:

- Existing public API:

  ```ts
  export class SnapshotReader {
    constructor(config: BfisConfig, logger?: StructuredLogger);

    async probeMissionOnce(): Promise<void>;
    async readOnce(): Promise<OlympusSnapshot>;
  }
  ```

- New method (internal API for BFIS):

  ```ts
  /**
   * Read a full context snapshot from Olympus.
   *
   * Builds on readOnce() to include mission + units (base snapshot)
   * and attaches normalized airbases, bullseyes, spots, drawings,
   * logs, and a basic weapons summary.
   */
  async readContextOnce(): Promise<BfisContextSnapshot>;
  ```

Implementation notes:

- `readContextOnce()`:
  - Calls the existing endpoint-fetching helpers (`fetchMission`, `fetchUnits`, `fetchWeapons`, `fetchLogs`, `fetchAirbases`, `fetchBullseyes`, `fetchSpots`, `fetchDrawings`) already present in `SnapshotReader`.
  - Reuses the session handling and `lastTimes` logic from `readOnce()` for consistency.
  - Uses new normalizer helpers (see below) to convert raw responses into `Normalized*` slices.
  - Assembles and returns a `BfisContextSnapshot`.
- `readOnce()` remains the canonical method for producing an `OlympusSnapshot` and is **not** required to change signature or behavior in this spec (though it may call shared helpers to avoid duplication).

5.2 Context normalizer helpers

Location (proposed): `bfis-service/src/context/` or within `bfis-service/src/snapshot/` if keeping everything co-located with SnapshotReader.

Helpers:

```ts
export function normalizeAirbases(raw: unknown): NormalizedAirbase[];
export function normalizeBullseyes(raw: unknown): NormalizedBullseye[];
export function normalizeSpots(raw: unknown): NormalizedSpot[];
export function normalizeDrawings(raw: unknown): NormalizedDrawing[];
export function normalizeLogs(raw: unknown): NormalizedLogEntry[];
export function buildWeaponsSummary(decodedWeapons: unknown): WeaponsSummary;
```

Requirements:

- Accept the raw JSON (or decoded weapons structure) from Olympus.
- Perform minimal shape checks (e.g., arrays vs objects, required fields present).
- Map to deterministic, stable structures:
  - Sort where appropriate (e.g., by name or ID) to avoid noisy ordering.
  - Drop unused fields rather than passing through unbounded payloads.
- On malformed or unexpected data:
  - Throw a descriptive error that will be caught and logged by `SnapshotReader` as `bfis-snapshot-decode-error`.

5.3 Logging

SnapshotReader should continue to use the existing structured logger for context-specific events:

- On successful context snapshot:

  ```ts
  logger.info("bfis-context-snapshot-ok", {
    snapshotId,
    sessionHash,
    unitCount,
    airbaseCount,
    bullseyeCount,
    spotCount,
    drawingCount,
    logCount,
    weaponsActiveCount,
  });
  ```

- On empty/minimal context:
  - Reuse or extend `bfis-snapshot-empty-data` warnings with an `endpoint` field (`"airbases"`, `"bullseyes"`, `"spots"`, `"drawings"`, `"logs"`, `"weapons"`).

This spec does not require NDJSON decision logs to change; it only ensures the context data exists in-memory for later consumption.

---

6. Success Criteria

For this spec to be considered complete:

- **SC-CTX-001**: On a healthy Olympus instance, `readContextOnce()` successfully returns a `BfisContextSnapshot` that includes:
  - Valid `base: OlympusSnapshot` (mission + units) as per spec-001.
  - Non-throwing normalization of airbases, bullseyes, spots, drawings, logs, and weapons summary when those endpoints are available.
- **SC-CTX-002**: If any single context endpoint fails (HTTP error, parse error), BFIS:
  - Logs a structured error with endpoint name and details.
  - Fails the current context snapshot poll without crashing the process.
- **SC-CTX-003**: When context endpoints return empty but valid payloads (e.g., no spots, no drawings, empty logs list), BFIS:
  - Logs structured “empty data” warnings.
  - Still produces a `BfisContextSnapshot` with empty arrays / zero counts for the relevant slices.
- **SC-CTX-004**: All context normalization routines are deterministic:
  - Given the same raw Olympus response, they always produce the same `Normalized*` output (ordering, field presence).
- **SC-CTX-005**: The `BfisContextSnapshot` type and its slices are documented in code (JSDoc/TSDoc), describing:
  - Their relationship to Olympus endpoints.
  - Intended use as inputs for future summaries, decisions, and LLM views.

