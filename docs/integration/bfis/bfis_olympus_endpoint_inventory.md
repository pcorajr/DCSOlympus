# Olympus Endpoint Inventory for BFIS (Verified)

This document captures the **verified** set of Olympus HTTP endpoints that BFIS is allowed to use, based on the actual frontend and backend code in this repository. It is the canonical reference for BFIS’ view of Olympus APIs.

BFIS must treat these endpoints as **read-only contracts** owned by Olympus: BFIS consumes them but does not change their behavior or semantics.

---

## 1. Core Olympus Read Endpoints

All Olympus read endpoints are exposed under the `/olympus` path and are proxied by the frontend server to the DCS backend.

### 1.1 Units – `GET /olympus/units`

- **Method / Path**: `GET /olympus/units`
- **Query params**:
  - `time`: Unix timestamp in milliseconds (number as string).  
    - `time=0` → full refresh  
    - `time={lastUpdateTime}` → differential update since last poll
- **Response**:
  - Binary payload (`arraybuffer` on the client) containing unit data.
  - First 8 bytes encode the server update timestamp as an unsigned 64‑bit integer (`uint64`, milliseconds); remainder is units payload (decoded by the existing DataExtractor logic in the frontend).
- **Usage pattern** (React `ServerManager`):
  - Fast polling: every 250 ms (or 2000 ms in AWACS mode) with `refresh=false` (differential).  
  - Periodic full refresh: every 5000 ms with `refresh=true` (`time=0`).

### 1.2 Weapons – `GET /olympus/weapons`

- **Method / Path**: `GET /olympus/weapons`
- **Query params**:
  - `time`: same semantics as `/olympus/units`.
- **Response**:
  - Binary payload (`arraybuffer`) containing weapon data with leading update timestamp (first 8 bytes as `uint64` milliseconds).
- **Usage pattern**:
  - Same polling and refresh strategy as units.

### 1.3 Logs – `GET /olympus/logs`

- **Method / Path**: `GET /olympus/logs`
- **Query params**:
  - `time`: Unix timestamp in milliseconds; returns logs after that time.
- **Response**:
  - JSON object containing:
    - `logs`: log entries
    - Common metadata fields (see section 1.8)
- **Usage pattern**:
  - Polled every 1000 ms by the frontend.
  - Uses `time=0` for full refresh vs `time={lastUpdateTime}` for incremental updates.

### 1.4 Airbases – `GET /olympus/airbases`

- **Method / Path**: `GET /olympus/airbases`
- **Query params**: none.
- **Response**:
  - JSON object with airbase information from mission data.
  - Includes common metadata fields (section 1.8).

### 1.5 Bullseyes – `GET /olympus/bullseyes`

- **Method / Path**: `GET /olympus/bullseyes`
- **Query params**: none.
- **Response**:
  - JSON object with bullseye coordinates per coalition.
  - Includes common metadata fields.

### 1.6 Spots – `GET /olympus/spots`

- **Method / Path**: `GET /olympus/spots`
- **Query params**: none.
- **Response**:
  - JSON object with current laser/IR spots.
  - Includes common metadata fields.

### 1.7 Mission – `GET /olympus/mission`

- **Method / Path**: `GET /olympus/mission`
- **Query params**: none.
- **Response**:
  - JSON mission object with:
    - Mission metadata.
    - Command mode options (`commandModeOptions`) including active mode based on credentials (Game master / Blue commander / Red commander / Observer).
  - Includes common metadata fields.
- **Usage pattern**:
  - Polled every 1000 ms by the frontend.

### 1.8 Drawings – `GET /olympus/drawings`

- **Method / Path**: `GET /olympus/drawings`
- **Query params**: none.
- **Response**:
  - JSON object with drawing data organized by layers (`drawings` field).
  - Includes common metadata fields.

### 1.9 Common JSON metadata fields

All JSON read endpoints (`/logs`, `/airbases`, `/bullseyes`, `/spots`, `/mission`, `/drawings`, `/commands`) include:

- `time`: current server timestamp in milliseconds (as string‑encoded number).
- `sessionHash`: current mission session identifier.
- `load`: server load indicator.
- `frameRate`: DCS simulation framerate.

BFIS must use `sessionHash` to detect mission resets and treat changes in `sessionHash` as a signal to reset its internal state.

---

## 2. Command Endpoints (Async Pattern)

BFIS issues commands via the same mechanism as the frontend.

### 2.1 Submit command – `PUT /olympus`

- **Method / Path**: `PUT /olympus`
- **Headers**:
  - `Authorization: Basic ...` – using one of the role passwords (Game master, Blue commander, Red commander), or via the frontend proxy headers.
  - `Content-Type: application/json`
  - `X-Command-Mode`: desired command role, e.g. `"Game master"`, `"Blue commander"`, `"Red commander"`.  
    This header is interpreted by the **frontend proxy**, which then rewrites the `Authorization` header to use the appropriate role password before forwarding the request to the Olympus backend. The backend itself only sees Basic Auth credentials.
- **Body**:
  - JSON object whose top-level keys are command names, e.g.:
    - `{ "spawnAircrafts": { ... } }`
    - `{ "setPath": { ... } }`
    - `{ "deleteUnit": { ... } }`
  - The backend scheduler dispatches based on these keys.
- **Response**:
  - JSON object containing:
    - `commandHash`: string identifier used to track async execution.

### 2.2 Check command status – `GET /olympus/commands`

- **Method / Path**: `GET /olympus/commands`
- **Query params**:
  - `commandHash`: the hash returned by `PUT /olympus`.
- **Response**:
  - JSON object including:
    - `commandExecuted`: boolean, true when the command has completed.
    - `commandResult`: result payload if available, or `null`.
    - Common metadata fields (time, sessionHash, load, frameRate).

BFIS must follow this pattern:

1. `PUT /olympus` with one or more commands → store `commandHash`.
2. Poll `GET /olympus/commands?commandHash=...` until:
   - `commandExecuted === true`, and
   - For commands that return data, `commandResult` is non‑null.  
     For commands with no return value, `commandResult` may remain JSON `null`; BFIS should treat `commandExecuted === true` as completion and decide per command whether a non‑null result is required.

---

## 3. Auxiliary Frontend Server Endpoints

These endpoints are provided by the Node/Express frontend server under `/api`, `/resources`, and `/admin`. BFIS **may** use some of them as optional inputs, but they are not required for the core BFIS loop.

### 3.1 Airbase reference data – `/api/airbases`

- `GET /api/airbases/:theatreName`
  - Returns all airbases for a given theatre (e.g. `caucasus`, `syria`).
- `GET /api/airbases/:theatreName/:airbaseName`
  - Returns detailed information for a specific airbase (runways, frequencies, charts).

BFIS may use these endpoints for scenario-building and spawn planning.

### 3.2 Elevation – `GET /api/elevation/:lat/:lng`

- Returns ground elevation in meters for given coordinates (SRTM-based).
- Optional for BFIS; useful for altitude/terrain-aware planning.

### 3.3 Unit databases – `GET /api/databases/:type/:name`

- Returns JSON database files for unit types (aircraft, helicopter, groundunit, navyunit).
- Path pattern: `/api/databases/:type/:name` where:
  - `:type` is currently `"units"`.
  - `:name` is the database name without file extension (for example `aircraftdatabase`).
- Example: `/api/databases/units/aircraftdatabase`.
- BFIS may use these for capabilities, loadouts, or type metadata.

### 3.4 Speech API – `/api/speech/*`

- `PUT /api/speech/generate`
  - Body: `{ text: string }`
  - Response: MP3 audio data.
- `PUT /api/speech/recognize`
  - Body: `{ data: string }` (base64 audio)
  - Response: transcribed text.

BFIS Copilot mode may use these endpoints indirectly via a UI/bridge, but they are not required for the core state/decision/command loop.

### 3.5 Resources – `/resources/*`

- `GET /resources/config`
  - Returns frontend configuration, audio settings, controllers, profiles, and local/remote flags.
- `PUT /resources/profile/*` and `/resources/sessiondata/*`
  - Manage user profiles and session-scoped data.

Primarily UI-facing; BFIS does not need these for MVP.

### 3.6 Admin – `/admin/*` (Admin role required)

- `GET /admin/config`, `PUT /admin/config`
  - Manage users and groups configuration.

BFIS does not use admin endpoints.

---

## 4. Authentication and Roles

- All `/olympus/*` endpoints are protected by Basic Auth:
  - Game master, Blue commander, Red commander (and optional Admin) passwords.
- The frontend server can also use custom auth headers to map users/groups to these roles.
- BFIS MVP runs using **Game Master** credentials only, giving it full control without needing to emulate complex role behavior.

---

## 5. BFIS Usage Summary

For the MVP, BFIS will:

- **Read from**:
  - `GET /olympus/units`
  - `GET /olympus/weapons`
  - `GET /olympus/logs`
  - `GET /olympus/mission`
  - `GET /olympus/airbases`
  - `GET /olympus/bullseyes`
  - `GET /olympus/spots`
  - `GET /olympus/drawings`
- **Command via**:
  - `PUT /olympus`
  - `GET /olympus/commands?commandHash=...`
- **Optionally consult**:
  - `/api/databases/*`
  - `/api/airbases/*`
  - `/api/elevation/*`

Any additional endpoint usage must be justified in BFIS design docs and remain within Olympus’ existing public API surface.

---

## Python API Reference

For a reference implementation of how to use these endpoints, see the Python API client at `scripts/python/API/api.py:86` which demonstrates proper authentication, command submission, and polling patterns.
