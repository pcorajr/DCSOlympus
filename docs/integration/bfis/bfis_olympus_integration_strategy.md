# BFIS ⇄ Olympus Integration Strategy (v2 – ratified)

**Goal**

keep Olympus as-is, make BFIS the external "brain" that observes, decides, and commands through Olympus’ existing API surface, and evolve this integration point into a clear, versioned BFIS ⇄ Olympus specification and API contract that defines responsibilities, data shapes, polling behavior, and command semantics for long‑term stability.

---

### **Ratification Checklist (Completed)**

All pre‑ratification tasks for this spec are complete. The linked documents are now part of the canonical BFIS ⇄ Olympus integration contract.

1. **Endpoint inventory**  
   ✅ **Completed.** See `docs/integration/bfis/bfis_olympus_endpoint_inventory.md` for the verified list of Olympus endpoints BFIS will use, including read endpoints, command endpoints, query parameters, and auxiliary frontend APIs.

2. **Async command flow spec**  
   ✅ **Completed.** See `docs/integration/bfis/bfis_olympus_command_flow.md` for the verified Olympus async command pattern:
   - `PUT /olympus` → returns `commandHash`.
   - `GET /olympus/commands?commandHash=...` → returns `commandExecuted` + `commandResult`.

3. **BFIS action → Olympus command mapping**  
   ✅ **Completed.** See `docs/integration/bfis/bfis_action_command_mapping.md` for the mapping between each `BfisActionType` and concrete Olympus command names and payload shapes (for example `SPAWN` → `spawnAircrafts` / `spawnGroundUnits`).

All three items above are **required** parts of the contract and must be kept in sync with this strategy document as BFIS evolves.

**Ratified:** 2025‑11‑16  
**Scope:** BFIS MVP integration with Olympus as defined in this repository and `docs/CONSTITUTION.md`.

---


## 1. Who does what

Think of it like this:

- **Olympus = the game room (unchanged)**

  - Talks to DCS through the DLL and Lua.
  - Knows all units, positions, events, and mission state.
  - Serves the web UI and exposes REST endpoints for commands and status.

- **BFIS = the brain in the corner (new sidecar)**

  - Reads what Olympus reports about the battlefield.
  - Decides what should happen next (spawn, move, attack, ROE changes, etc.).
  - Sends commands back to Olympus using the **same APIs** the UI already uses.
  - Logs what it saw, what it decided, and what it told Olympus to do.

New rule:

> **Olympus runs the world. BFIS reads Olympus state and tells Olympus what to do.**

BFIS never talks to DCS directly.

---

## 2. How Olympus is wired (simplified)

High-level flow inside Olympus:

1. **Frontend (browser UI)** ↔ **Node/Express server** (port 3000)
   - UI is the remote control.
   - Backend is the machine room.
2. **Node/Express server** ↔ **DLL / Lua inside DCS**
   - Sends commands: spawn, move, attack, etc.
   - Receives telemetry: unit positions, events, status.
3. **Backend** pushes updates back to the **frontend**
   - Keeps the map, panels, and unit lists in sync.

Pipeline:

```text
User → Frontend → Olympus Backend → DCS
DCS → Olympus Backend → Frontend
```

Important: **we do not change any of this.** Olympus is treated as upstream.

---

## 3. Where BFIS connects (sidecar pattern)

BFIS lives in the same repository as DCSOlympus (to take advantage of DeepWiki and Devin.ai), but as a **separate service** in its own folder (for example a `bfis-service` directory alongside existing code).

Key rules:

- BFIS has its **own package.json, docs, and code**, separate from frontend/backend/core.
- BFIS **only talks to Olympus over its public HTTP API** (REST + binary streams).
- BFIS never reaches into Olympus internals or the DLL.

No new endpoints are added to Olympus for BFIS. No forks. No patching the DLL.

---

## 4. The conversation (minimal contract)

We keep the BFIS ⇄ Olympus conversation stupid simple:

1. **BFIS pulls state from Olympus**

   - "Give me the current battlefield snapshot" (units, positions, status, and any other relevant state).
- For **units and weapons**, BFIS calls the existing binary endpoints and decodes them using the same binary format Olympus already uses.
- For other data (mission, airbases, bullseyes, spots, logs, drawings), BFIS consumes the existing JSON responses.

2. **BFIS thinks**

   - Runs its logic / LLM prompt to decide what should happen.
   - Produces a list of actions (spawn/move/attack/whatever) tied to unit IDs or coordinate targets.

3. **BFIS sends commands to Olympus**

   - Uses existing Olympus REST commands.
   - Receives **command hashes** or IDs back.
   - Logs those so it can correlate "asked" vs "executed" later.

4. **BFIS logs everything for replay**

   - Input snapshot summary.
   - Prompt / reasoning metadata (not full raw text if we don't want).
   - Output commands + hashes.
   - Basic timing / success status.
   - Current `sessionHash`, so replays can detect when missions restarted.

5. **BFIS polling (MVP default)**

   BFIS polls Olympus with conservative intervals to avoid adding load:

   - Units / weapons (binary): every **2000 ms** (full + incremental as needed).
   - Logs: every **1000–2000 ms**.
   - Mission / airbases / bullseyes / spots / drawings: every **5000–10000 ms**.

   These values are starting points and can be tuned later based on BFIS decision latency and host performance.

In code terms later, this becomes a small, explicit API contract:

```text
GET  /olympus/...     # Existing Olympus endpoints BFIS reads
POST /olympus/...     # Existing Olympus commands BFIS uses

BFIS internal:
- /bfis/decision      # Optional: endpoint BFIS exposes if we front it with a router
```

But for now the rule is simple: **BFIS only consumes and produces shapes that Olympus already understands.**

---

## 5. What BFIS does NOT do

To avoid the old mess, BFIS does **not**:

- Track units on its own as a second source of truth.
- Rebuild coordinate systems or map widgets.
- Implement its own DCS connector, Lua scripts, or DLL.
- Replace Olympus’ gateway or UI.

Whenever you start to do that, you stop and say:

> "Let Olympus handle that; BFIS only needs the results."

## Where is the code?

- BFIS sidecar service implementation lives in `bfis-service/`.
- Shared TypeScript schemas that define the BFIS ⇄ Olympus data contract live in `shared-schemas/index.ts`.

BFIS job description:

> **Read state → decide → send commands → log.**

Anything beyond that must be justified and small.

---

## 6. Tiny adapter, not a circus

Instead of spawning more services, we keep one simple BFIS service that:

- Knows how to talk to Olympus’ REST API.
- Knows how to turn Olympus state into a compact internal model.
- Knows how to turn BFIS decisions into valid Olympus commands.
- Logs in NDJSON so we can replay decisions later if we care.

---

## 7. Shared Schemas (Required)

`DCSOlympus/shared-schemas/` holds the core TypeScript interfaces that define the BFIS ⇄ Olympus data contract.

These types are imported by:

- `DCSOlympus/frontend` (if needed)
- `DCSOlympus/bfis-service`

### Included Types

```ts
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
   * There is no dedicated Olympus "/events" endpoint.
   */
  events?: OlympusEvent[];
}


export type BfisActionType = "SPAWN" | "MOVE" | "ATTACK" | "RTB" | "HOLD" | "CUSTOM";

export interface BfisActionTarget {
  unitId?: string;
  groupId?: string;
  coordinateRef?: { lat: number; lon: number; altMeters?: number };
  zoneId?: string;
}

export interface BfisActionParams {
  unitType?: string;
  count?: number;
  speedKts?: number;
  altitudeMeters?: number;
  waypointId?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface BfisAction {
  type: BfisActionType;
  target: BfisActionTarget;
  params?: BfisActionParams;
}

export interface BfisDecision {
  decisionId: string;
  snapshotId: string;
  missionId: string;
  serverId: string;
  model: string;
  reasoningNotes?: string;
  actions: BfisAction[];
}

export type CommandStatus = "PENDING" | "SENT" | "CONFIRMED" | "FAILED";

export interface CommandResult {
  actionIndex: number;
  commandName: string;
  commandHash: string;
  status: CommandStatus;
  error?: string;
}
```

### Purpose

- One shared source of truth for all request/response shapes.
- Prevents BFIS & Olympus from drifting apart.
- DeepWiki can fully document the interface.
- TypeScript enforces compatibility across services.

---

## 8. NDJSON Logging – Minimal, Replay-Friendly

BFIS logs **one line of NDJSON per decision cycle**. Each line is a self‑contained record; no cross‑file magic.

Required fields (names are stable):

- `ts` → ISO timestamp when BFIS created the decision.
- `decisionId` → UUID for this BFIS decision.
- `missionId` → ID/name of the current mission (as seen by Olympus).
- `serverId` → logical DCS/Olympus server identifier.
- `bfisVersion` → git SHA or semver of bfis-service.

Snapshot metadata (no full snapshot body):

- `snapshotId` → ID or hash of the Olympus snapshot BFIS used.
- `snapshotSummary` → small summary (for example unit counts by coalition/type).
- `snapshotSource` → which Olympus endpoint(s) were called.
- `sessionHash` → Olympus session hash at the time of the decision (used to detect mission resets).

LLM / reasoning telemetry:

- `model` → model name used for the decision (for example `llama3-8b-instruct`).
- `promptHash` → hash of the prompt/template (not the full text).
- `tokensPrompt` / `tokensCompletion` → token counts.
- `latencyMs` → end‑to‑end decision latency.
- `reasoningNotes` → short, optional human‑readable note or tag.

Decision & command linkage:

- `actions` → array of planned actions BFIS decided, each with:
  - `type` (for example `SPAWN`, `MOVE`, `ATTACK`, `RTB`).
  - `target` (unitId, groupId, or coordinate reference).
  - `params` (small bag of extra fields like speed, altitude, formation).
- `olympusCommands` → array mapping BFIS actions to Olympus:
  - `actionIndex` → index into `actions[]`.
  - `commandName` → Olympus command called.
  - `commandHash` → hash/ID returned by Olympus.
  - `status` → `PENDING`, `SENT`, `CONFIRMED`, `FAILED`.
  - `error` → optional error text.

Example shape:

```json
{"ts":"2025-11-16T14:32:10.123Z","decisionId":"uuid-123","missionId":"op_valkyrie","serverId":"magic-11","bfisVersion":"bfis-dev@abc123","snapshotId":"snap-456","snapshotSummary":{"blueUnits":12,"redUnits":18},"snapshotSource":["/api/olympus/units","/api/olympus/logs"],"model":"llama3-8b-instruct","promptHash":"sha256:deadbeef","tokensPrompt":820,"tokensCompletion":210,"latencyMs":740,"reasoningNotes":"reinforce blue CAP, push SEAD east","actions":[{"type":"SPAWN","target":{"zone":"CAP_EAST"},"params":{"unitType":"F-16","count":2}},{"type":"MOVE","target":{"groupId":"BLUE_SEAD_1"},"params":{"waypoint":"WP3"}}],"olympusCommands":[{"actionIndex":0,"commandName":"spawnAircrafts","commandHash":"cmd-aaa","status":"SENT"},{"actionIndex":1,"commandName":"setGroupRoute","commandHash":"cmd-bbb","status":"SENT"}]}
```

Principles:

- No full raw prompts or snapshots by default → hashes and summaries only.
- One record per decision → easy to grep, replay, or audit.
- Stable top‑level field names → future tools can rely on them.

This is the baseline spec for BFIS NDJSON logs; future fields must be added without breaking these names or semantics.

---

## 9. MVP Assumptions

To keep v1 simple and shippable:

- **Auth mode**: BFIS runs using **Game Master** credentials only, so it has full control and does not need to respect coalition‑restricted command modes yet.
- **Events**: there is no dedicated `/events` endpoint; any "events" BFIS uses are derived from `/logs` or from comparing successive snapshots.
- **Binary data**: BFIS will implement binary decoding for units/weapons using the same format Olympus already uses (porting the existing `DataExtractor` implementation from the Olympus client code), instead of requesting new JSON endpoints.
- **Command model**: BFIS follows the async Olympus pattern
  - `PUT /olympus/command` → returns `commandHash`.
  - `GET /olympus/commands?commandHash=...` → polled until `commandExecuted = true`.
- **Mission resets**: BFIS tracks `sessionHash` from Olympus responses and resets its internal world state when the hash changes. (`PUT /command` → `commandHash`, then `GET /commands?commandHash=...`).

These constraints define the MVP; anything outside them is explicitly post‑MVP.


---

## 10. Branching Strategy (canonical for DCSOlympus monorepo)

To protect upstream Olympus code and isolate BFIS development, the repo must follow this branching model:

- `release-candidate` → untouched upstream branch.
  - Only fast‑forwards or rebases when Olympus updates.

- `bfis-dev` (default branch) → main development branch for all BFIS work.
  - Created directly from `release-candidate`.
  - All BFIS code, schemas, monorepo layout, and sidecar logic live here.

- **Feature branches** → short‑lived branches created *from `bfis-dev`*.
  - Example: `feature/bfis-telemetry-loop`, `feature/bfis-llm-decider`.
  - Merged back into `bfis-dev` when complete.

Rules:
- Upstream changes go → `release-candidate` → rebase `bfis-dev` when needed.
- BFIS never commits directly to `release-candidate`.
- `bfis-dev` remains the working truth for DeepWiki/Devin.
- Feature branches stay isolated and small.

This keeps Olympus pristine, gives BFIS a safe sandbox, and avoids collisions between upstream and BFIS development.

---

## 11. Explicitly Out of Scope for MVP

To avoid scope creep, the following are **post‑MVP** by definition:

- Coalition‑restricted modes (Blue/Red Commander behavior and spawn‑point economics).
- WebSocket or other real‑time streaming integrations.
- New Olympus endpoints (for example JSON wrappers around binary unit/weapon data).
- Any BFIS web UI or dashboard.
- Multi‑mission orchestration or replay viewer.
- Automated LLM prompt tuning/optimization beyond basic prompt templates.

These items can be revisited only after the MVP loop (poll → snapshot → decide → command → log) is stable and tested.

This keeps Olympus pristine, gives BFIS a safe sandbox, and avoids collisions between upstream and BFIS development.
