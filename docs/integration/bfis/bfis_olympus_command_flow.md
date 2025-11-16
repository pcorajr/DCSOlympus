# BFIS ⇄ Olympus Async Command Flow (Verified)

This document defines the **async command pattern** BFIS must follow when sending commands to Olympus. It is based on the actual frontend (React) and backend (C++) implementations and is considered canonical for BFIS.

BFIS MUST use this pattern and MUST NOT introduce alternative command channels to DCS.

---

## 1. Overview

All BFIS commands to the DCS world go through the Olympus backend via the same mechanism as the web UI:

- Submit command(s):  
  **`PUT /olympus`** → returns `commandHash`
- Poll for completion:  
  **`GET /olympus/commands?commandHash={hash}`** → returns `commandExecuted` + `commandResult`

The backend scheduler processes commands asynchronously; BFIS is responsible for associating each sent command with its `commandHash` and tracking it until completion or timeout.

---

## 2. Command Submission – `PUT /olympus`

### 2.1 Request

- **Method / Path**: `PUT /olympus`
- **Headers**:
  - `Authorization: Basic <base64(username:password)>`
    - In practice, BFIS uses Game master credentials for MVP.
  - `Content-Type: application/json`
  - `X-Command-Mode: "Game master" | "Blue commander" | "Red commander"`  
    - Interpreted by the **frontend proxy layer**, which picks the corresponding role password and rewrites the `Authorization` header before forwarding the request to the Olympus backend. The backend itself only checks Basic Auth credentials.

- **Body**:
  - JSON object where each **top-level key is a command name**, and the value is that command’s parameters.
  - Examples:

    ```json
    {
      "spawnAircrafts": {
        "units": [/* ... */],
        "coalition": "BLUE",
        "airbaseName": "Batumi",
        "country": "USA",
        "immediate": true,
        "spawnPoints": 2
      }
    }
    ```

    ```json
    {
      "setPath": {
        "ID": 12345,
        "path": [/* waypoints */]
      }
    }
    ```

    ```json
    {
      "deleteUnit": {
        "ID": 67890,
        "explosion": false,
        "explosionType": "none",
        "immediate": true
      }
    }
    ```

  - The backend scheduler (`scheduler->handleRequest`) dispatches based on these keys.

### 2.2 Response

On success, Olympus returns:

```json
{
  "commandHash": "cmd-xyz-123"
}
```

- `commandHash` is a string used for async tracking.
- There is no immediate indication of success or failure of the underlying DCS command; only the scheduler has started handling it.
- The exact format of `commandHash` is implementation-defined and opaque; BFIS must treat it as an identifier string only and never infer semantics from its structure.

BFIS MUST store the `commandHash` along with context about which BFIS action(s) it corresponds to.

---

## 3. Command Status – `GET /olympus/commands`

### 3.1 Request

- **Method / Path**: `GET /olympus/commands`
- **Query params**:
  - `commandHash`: the hash returned from `PUT /olympus`.

Example:

```text
GET /olympus/commands?commandHash=cmd-xyz-123
```

- **Headers**:
  - Same auth headers as other `/olympus/*` requests (Basic Auth).

### 3.2 Response

The backend builds the response from the scheduler and execution results:

```json
{
  "commandExecuted": true,
  "commandResult": { /* or null */ },
  "time": "1731763200123",
  "sessionHash": "1731763199000",
  "load": 0.12,
  "frameRate": 59.9
}
```

- `commandExecuted`: boolean
  - `false` → command still in progress or queued.
  - `true` → scheduler has completed processing the command.
- `commandResult`:
  - JSON result when available, or `null` if there is no data or the command does not return a value. The backend explicitly sets `commandResult` to JSON `null` when no result exists.
- `time`, `sessionHash`, `load`, `frameRate`:
  - Common Olympus metadata fields; see the endpoint inventory.

The frontend’s Python client considers a command “done” when:

- `commandExecuted === true`, and
- `commandResult` is non-null (or when BFIS decides `commandResult` is not required).

---

## 4. BFIS Polling Behavior for Commands

BFIS MUST follow a conservative, predictable polling behavior when tracking commands:

1. **Submit** via `PUT /olympus` and capture `commandHash`.
2. **Poll** `GET /olympus/commands?commandHash={hash}` at a fixed interval.
3. **Stop polling** when:
   - `commandExecuted === true` (success path, even if `commandResult` is null for that command type), or
   - A reasonable timeout is reached (e.g., 60 seconds), or
   - `sessionHash` changes (mission reset; BFIS must treat outstanding commands as canceled).

### 4.1 Recommended BFIS defaults (MVP)

- **Poll interval**: 1000 ms (1 second) per outstanding command.
- **Max wait time**: 60 seconds (after which BFIS marks the command as failed/unknown).
- **Session reset handling**:
  - If `sessionHash` in the command status response differs from the snapshot used when issuing the command, BFIS should:
    - Mark the command as effectively canceled.
    - Reset or rebuild internal state based on the new mission/session.
- **Scheduler load throttling**:
  - The Olympus scheduler adjusts its internal `load` and may defer command execution to protect DCS framerate.
  - BFIS timeouts and expectations must account for this throttling: commands might complete more slowly under high server load, and aggressive polling must not be used to “push” them through faster.

BFIS MAY tune these values in configuration, but must avoid aggressive polling that would overload Olympus.

---

## 5. BFIS Internal Command Tracking Model

BFIS tracks commands using its own internal `CommandResult` structure (defined in `shared-schemas/index.ts`):

```ts
export type CommandStatus = "PENDING" | "SENT" | "CONFIRMED" | "FAILED";

export interface CommandResult {
  actionIndex: number;
  commandName: string;
  commandHash: string;
  status: CommandStatus;
  error?: string;
}
```

Recommended mapping:

- After `PUT /olympus` returns:
  - `status = "SENT"`, `commandHash` set, `commandName` set to the Olympus command (e.g., `"spawnAircrafts"`).
- While polling:
  - When `commandExecuted === false` → remain `"SENT"`.
- On completion:
  - If `commandExecuted === true` and no error condition detected → `"CONFIRMED"` (even when `commandResult` is JSON `null` for commands that have no return payload).
  - On timeout, session reset, or detected failure → `"FAILED"` with `error` message.

BFIS logs these states into its NDJSON decision records, linking each BFIS action to its Olympus command and status.

---

## 6. Differences vs. Initial Draft Spec

The initial BFIS strategy draft referenced:

- `PUT /olympus/command`

The **verified implementation** uses:

- `PUT /olympus`

All BFIS documentation and code MUST standardize on `PUT /olympus` as the command submission endpoint, and treat `/olympus/commands` as the sole status-check endpoint.

---

## 7. Summary for Implementers

- Always send commands via `PUT /olympus` with a JSON body keyed by Olympus command names.
- Always track the returned `commandHash`.
- Always poll `GET /olympus/commands?commandHash={hash}` until:
  - `commandExecuted === true`, or
  - Timeout, or
  - Mission session changes.
- Use `CommandResult` + NDJSON logging to keep a clear audit trail between BFIS decisions and Olympus execution.
