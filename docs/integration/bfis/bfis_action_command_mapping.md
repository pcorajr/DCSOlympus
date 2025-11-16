# BFIS Action → Olympus Command Mapping (MVP Scope)

This document maps BFIS’ abstract action types to concrete Olympus command names and parameter shapes as implemented in the frontend `ServerManager` and backend scheduler. All commands listed here are in scope for the MVP; BFIS may start with a smaller subset but MUST NOT invent new Olympus command names.

BFIS actions are defined in `shared-schemas/index.ts`:

- `BfisActionType = "SPAWN" | "MOVE" | "ATTACK" | "RTB" | "HOLD" | "CUSTOM"`

Each BFIS action has:

- `type`: one of the action types above.
- `target`: `BfisActionTarget` (unitId, groupId, coordinateRef, zoneId).
- `params`: `BfisActionParams` (unitType, count, speedKts, altitudeMeters, waypointId, notes, and any additional typed fields defined in `shared-schemas/index.ts`).

BFIS maps these to Olympus commands by choosing an appropriate command name and constructing the Olympus payload from `target` and `params`.

---

## 1. SPAWN

High-level intent: create new units in the world (air, helo, ground, navy) or duplicate existing ones.

### 1.1 Core SPAWN commands

- `spawnAircrafts`
  - BFIS usage: spawn fixed‑wing aircraft packages.
  - Payload (top-level):
    - `units`: array of unit objects:
      - `unitType`: string.
      - `location`: `{ lat: number; lng: number }`.
      - `altitude`: number (meters).
      - `heading` (optional): number (degrees).
      - `loadout`: string.
      - `liveryID`: string.
      - `skill`: string.
      - `payload` (optional): string.
    - `coalition`: string (typically `"blue"` or `"red"`; passed through to backend).
    - `airbaseName`: string.
    - `country`: string.
    - `immediate`: boolean.
    - `spawnPoints`: number.

- `spawnHelicopters`
  - Same structure as `spawnAircrafts`, used for rotary‑wing.

- `spawnGroundUnits`
  - BFIS usage: spawn ground units.
  - Payload (top-level):
    - `units`: array of unit objects:
      - `unitType`: string.
      - `location`: `{ lat: number; lng: number }`.
      - `heading` (optional): number (degrees).
      - `liveryID`: string.
      - `skill`: string.
    - `coalition`: string.
    - `country`: string.
    - `immediate`: boolean.
    - `spawnPoints`: number.

- `spawnNavyUnits`
  - Same payload structure as `spawnGroundUnits`, used for naval units.

- `cloneUnits`
  - BFIS usage: duplicate selected units to new positions, potentially deleting originals.
  - Payload:
    - `units`: array of:
      - `ID`: number (source unit ID).
      - `location`: `{ lat: number; lng: number }` (new position).
    - `coalition`: string (may be `"blue"`, `"red"`, or `"all"`).
    - `deleteOriginal`: boolean.
    - `spawnPoints`: number.

### 1.2 SPAWN-related helpers

- `reloadDatabases`
  - Triggers Olympus to reload unit databases; BFIS may call this when its own view of available types is stale.

BFIS SPAWN actions should map to these commands, choosing the concrete command (`spawnAircrafts`, `spawnGroundUnits`, `spawnNavyUnits`, `spawnHelicopters`) based on `params.unitType` or scenario context.

---

## 2. MOVE

High-level intent: move units, change their trajectory, speed, or altitude, or reposition supporting elements like spots.

### 2.1 Path and position

- `setPath`
  - Frontend wrapper: `addDestination(ID, path)`.
  - Payload:
    - `ID`: group or unit identifier.
    - `path`: array of waypoints:
      - `lat`: number.
      - `lng`: number.
      - `threshold` (optional): number (distance threshold for arrival).
  - BFIS usage: MOVE actions that assign new waypoints or routes.

- `landAt`
  - Payload:
    - `ID`: unit/group ID.
    - `location`: `{ lat: number; lng: number }`.
  - BFIS usage: “RTB to airfield/point” in a MOVE sense (see also RTB section).

- `landAtPoint`
  - Payload:
    - `ID`: unit/group ID.
    - `location`: `{ lat: number; lng: number }`.

- `setRacetrack`
  - Payload:
    - `ID`: unit/group ID.
    - `length`: number.
    - `location`: `{ lat: number; lng: number }` (racetrack anchor).
    - `bearing`: number (degrees).
  - BFIS usage: define racetrack or orbit patterns for CAP/tanker/loiter tasks.

- `moveSpot`
  - Payload:
    - `spotID`: number.
    - `location`: `{ lat: number; lng: number }`.
  - BFIS usage: reposition laser/IR spots as part of MOVE or ATTACK plans.

### 2.2 Speed & altitude

- `changeSpeed`
  - Payload:
    - `ID`: unit/group ID.
    - `change`: string (speed change directive, as consumed by `Unit::changeSpeed`).

- `changeAltitude`
  - Payload:
    - `ID`: unit/group ID.
    - `change`: string (altitude change directive, as consumed by `Unit::changeAltitude`).

- `setSpeed`
  - Payload:
    - `ID`: unit/group ID.
    - `speed`: number (desired speed).

- `setSpeedType`
  - Payload:
    - `ID`: unit/group ID.
    - `speedType`: string (e.g., IAS/TAS/Mach, as used by Olympus).

- `setAltitude`
  - Payload:
    - `ID`: unit/group ID.
    - `altitude`: number (desired altitude).

- `setAltitudeType`
  - Payload:
    - `ID`: unit/group ID.
    - `altitudeType`: string (e.g., AGL/MSL, as used by Olympus).

BFIS MOVE actions that only tweak kinematics (speed/altitude) should use these commands.

### 2.3 Movement-related toggles

- `setFollowRoads`
  - Payload:
    - `ID`: unit/group ID.
    - `followRoads`: boolean.

- `setOnOff`
  - Payload:
    - `ID`: unit/group ID.
    - `onOff`: boolean (on/off state for the unit, e.g., systems/engines as interpreted by Olympus).

---

## 3. ATTACK

High-level intent: task units to engage targets or perform kinetic actions.

### 3.1 Direct target assignments

- `attackUnit`
  - Payload:
    - `ID`: attacker.
    - `targetID`: target.
  - BFIS usage: ATTACK actions where both attacker and target are known units.

- `followUnit`
  - Payload:
    - `ID`: follower.
    - `targetID`: lead.
    - `offsetX`, `offsetY`, `offsetZ`.
  - BFIS usage: tactical following/escort tasks (classified as ATTACK or MOVE depending on context).

### 3.2 Area / point attacks

- `bombPoint`
  - Payload:
    - `ID`: attacker unit/group ID.
    - `location`: `{ lat: number; lng: number }`.
  - Behavior:
    - Sets the unit’s target position to `location` and state to `BOMB_POINT`.

- `carpetBomb`
  - Payload:
    - `ID`: attacker unit/group ID.
    - `location`: `{ lat: number; lng: number }`.
  - Behavior:
    - Sets the unit’s target position to `location` and state to `CARPET_BOMB`.

- `bombBuilding`
  - Payload:
    - `ID`: attacker unit/group ID.
    - `location`: `{ lat: number; lng: number }`.
  - Behavior:
    - Sets the unit’s target position to `location` and state to `BOMB_BUILDING`.

- `fireAtArea`
  - Payload:
    - `ID`: firing unit ID.
    - `location`: `{ lat: number; lng: number }`.
  - Behavior:
    - Sets the unit’s target position to `location` and state to `FIRE_AT_AREA`.

BFIS ATTACK actions that reference coordinates instead of target unit IDs should use these commands.

### 3.3 Fire support and effects

- `fireLaser`
  - Payload:
    - `ID`: unit ID (laser designator).
    - `location`: `{ lat: number; lng: number }` (target point).
    - `code`: number (laser code, e.g. `1688`).

- `fireInfrared`
  - Payload:
    - `ID`: unit ID.
    - `location`: `{ lat: number; lng: number }`.

- `simulateFireFight`
  - Payload:
    - `ID`: unit ID.
    - `location`: `{ lat: number; lng: number }`.
    - `altitude`: number.

- `scenicAAA`
- `missOnPurpose`
  - Payload:
    - `ID`: unit ID.
  - Behavior:
    - `scenicAAA`: sets unit state to `SCENIC_AAA`.
    - `missOnPurpose`: sets unit state to `MISS_ON_PURPOSE`.

These commands represent various “fire” or scenic effects. BFIS can treat them as ATTACK variants, often for scenario-building or immersion rather than tactical victory.

---

## 4. RTB (Return to Base)

High-level intent: send units home or to safe locations.

BFIS does not have a dedicated Olympus `RTB` command; RTB is expressed via MOVE‑style commands:

- `landAt`
- `landAtPoint`
- `setPath` to a home base or holding pattern
- Possibly `refuel` when directing tankers or returning aircraft to tanker tracks

Mapping recommendation:

- `BfisActionType = "RTB"`:
  - If `target.coordinateRef` near airbase → `landAt`/`landAtPoint`.
  - If only zone/area known → `setPath` to a safe holding pattern, then `landAt` when appropriate.

RTB is therefore a semantic label on top of MOVE commands.

---

## 5. HOLD

High-level intent: restrict or relax unit behavior (weapons, threat reactions, on/off states).

### 5.1 Rules of engagement & behavior

- `setROE`
  - Payload:
    - `{ ID, ROE }` where `ROE` is an index into the `ROEs` array (e.g., free, designated, return, hold).
  - BFIS usage: translate HOLD/ATTACK posture into Olympus ROE.

- `setReactionToThreat`
  - Payload:
    - `{ ID, reactionToThreat }` as an index into `reactionsToThreat`.

- `setEmissionsCountermeasures`
  - Payload:
    - `{ ID, emissionsCountermeasures }` index.

- `setAlarmState`
  - Payload:
    - `{ ID, alarmState }`.

### 5.2 Operational toggles

- `setOnOff`
  - Payload:
    - `ID`: unit/group ID.
    - `onOff`: boolean.
  - Behavior:
    - Toggles the unit’s on/off state as defined by Olympus (e.g., power/systems).

- `setOperateAs`
  - Payload:
    - `ID`: unit/group ID.
    - `operateAs`: number (mode index).
  - Behavior:
    - Changes operational mode (`operateAs` flag) used by Olympus.

- `setShotsScatter`
- `setShotsIntensity`
  - Payload:
    - `ID`: unit/group ID.
    - `shotsScatter` / `shotsIntensity`: number (0–n, used as an index/level by Olympus).
  - Behavior:
    - Tunes scenic fire behavior for units performing simulated firefights or similar tasks.

BFIS HOLD actions should map to these commands to implement “weapons hold/free,” “radar quiet,” or “stay defensive” behaviors.

---

## 6. CUSTOM

High-level intent: anything that doesn’t neatly fall into SPAWN/MOVE/ATTACK/RTB/HOLD, or compound actions.

`CUSTOM` is a **semantic tag**, not a different transport. A `CUSTOM` BFIS action:

- Still maps to one or more concrete Olympus commands (as listed below).
- Still goes over `PUT /olympus` + `GET /olympus/commands?...` like every other action.
- Must log its underlying commands in `olympusCommands[]` so the NDJSON remains fully auditable.

Examples of Olympus commands that BFIS may treat as `CUSTOM`:

- `spawnSmoke`
- `spawnExplosion`
- `setAdvancedOptions`
  - Tanker/AWACS roles, TACAN, radios, general settings.
- `setEngagementProperties`
  - Detailed gun/AAA parameters.
- `setCommandModeOptions`
  - High‑level Olympus command mode options (used sparingly in BFIS).
- `setLaserCode`
- `deleteUnit`
- `deleteSpot`
 - `setCargoWeight`
 - `registerDrawArgument`
 - `setCustomString`
 - `setCustomInteger`

BFIS `CUSTOM` actions may:

- Wrap one or more of these commands into higher‑level scenario steps (for example “set up scenic AAA at this location”).
- Represent experimental or non‑core behaviors that don’t yet fit the main action types.
- Capture one‑off or scenario‑builder actions where the primary value is the human‑readable `reasoningNotes` and NDJSON log, not a rigid tactical category.

Agents and implementers should prefer SPAWN/MOVE/ATTACK/RTB/HOLD when possible and reach for `CUSTOM` only when the intent truly doesn’t fit those buckets. When in doubt, document the intent clearly in the decision’s `reasoningNotes`.

### 6.1 Explicit payloads for CUSTOM‑mapped commands

- `smoke` (frontend: `spawnSmoke`)
  - Payload:
    - `color`: string.
    - `location`: `{ lat: number; lng: number }`.

- `explosion` (frontend: `spawnExplosion`)
  - Payload:
    - `intensity`: number.
    - `explosionType`: string.
    - `location`: `{ lat: number; lng: number }`.

- `setAdvancedOptions`
  - Payload:
    - `ID`: unit/group ID.
    - `isActiveTanker`: boolean.
    - `isActiveAWACS`: boolean.
    - `TACAN`:
      - `isOn`: boolean.
      - `channel`: number.
      - `XY`: string (single character `"X"` or `"Y"`).
      - `callsign`: string (up to 3 characters; longer values are truncated).
    - `radio`:
      - `frequency`: number.
      - `callsign`: number.
      - `callsignNumber`: number.
    - `generalSettings`:
      - `prohibitJettison`: boolean.
      - `prohibitAA`: boolean.
      - `prohibitAG`: boolean.
      - `prohibitAfterburner`: boolean.
      - `prohibitAirWpn`: boolean.

- `setEngagementProperties`
  - Payload:
    - `ID`: unit/group ID.
    - `barrelHeight`: number.
    - `muzzleVelocity`: number.
    - `aimTime`: number.
    - `shotsToFire`: number.
    - `shotsBaseInterval`: number.
    - `shotsBaseScatter`: number.
    - `engagementRange`: number.
    - `targetingRange`: number.
    - `aimMethodRange`: number.
    - `acquisitionRange`: number.

- `setCommandModeOptions`
  - Payload:
    - Arbitrary JSON object as defined by Olympus’ `setCommandModeOptions` implementation (BFIS should treat this as opaque, passing through UI‑derived structures when needed).

- `setLaserCode`
  - Payload:
    - `spotID`: number.
    - `code`: number.

- `deleteUnit`
  - Payload:
    - `ID`: unit ID.
    - `explosion`: boolean.
    - `explosionType`: string.
    - `immediate`: boolean.

- `deleteSpot`
  - Payload:
    - `spotID`: number.

---

## 7. Summary Table (MVP)

High-level mapping (not exhaustive of every parameter):

- `SPAWN` →
  - `spawnAircrafts`, `spawnHelicopters`, `spawnGroundUnits`, `spawnNavyUnits`, `cloneUnits`, `reloadDatabases` (support).
- `MOVE` →
  - `setPath`, `landAt`, `landAtPoint`, `setRacetrack`, `changeSpeed`, `setSpeed`, `setSpeedType`, `changeAltitude`, `setAltitude`, `setAltitudeType`, `setFollowRoads`, `moveSpot`, `setOnOff` (movement‑adjacent).
- `ATTACK` →
  - `attackUnit`, `followUnit`, `bombPoint`, `carpetBomb`, `bombBuilding`, `fireAtArea`, `fireLaser`, `fireInfrared`, `simulateFireFight`, `scenicAAA`, `missOnPurpose`.
- `RTB` →
  - Expressed via `landAt`, `landAtPoint`, `setPath`, and optionally `refuel`.
- `HOLD` →
  - `setROE`, `setReactionToThreat`, `setEmissionsCountermeasures`, `setAlarmState`, `setOperateAs`, `setOnOff`, `setShotsScatter`, `setShotsIntensity`.
- `CUSTOM` →
  - `spawnSmoke`, `spawnExplosion`, `setAdvancedOptions`, `setEngagementProperties`, `setCommandModeOptions`, `setLaserCode`, `deleteUnit`, `deleteSpot`, `setCargoWeight`, `registerDrawArgument`, `setCustomString`, `setCustomInteger`, and any compound behaviors built on top of them.

Any BFIS implementation must:

- Use **only** these defined Olympus command names for MVP.
- Treat BFIS action types as a higher‑level abstraction over this set.
- Extend this mapping document if new Olympus commands are adopted in future versions.
