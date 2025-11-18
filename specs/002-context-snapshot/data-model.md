# Data Model: BFIS Context Snapshot

**Date**: 2025-11-17  
**Feature**: 002-context-snapshot

## Overview

This document defines the data entities, relationships, and validation rules for BFIS context snapshot functionality. Entities are organized into:
1. **Internal Types** (in `bfis-service/src/types/` or `bfis-service/src/context/types.ts`) - BFIS-only implementation details
2. **Shared Schemas** (in `shared-schemas/index.ts`) - Not modified for this spec (BfisContextSnapshot is internal for now)

## Entity Definitions

### 1. BfisContextSnapshot (Internal Type)

**Location**: `bfis-service/src/context/types.ts` (or `bfis-service/src/types/internal.ts`)  
**Purpose**: Represents a unified snapshot containing all battlefield context in one place. This is the primary output of `SnapshotReader.readContextOnce()`.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `base` | `OlympusSnapshot` | Yes | Core Olympus snapshot from shared schemas (mission + units + sessionHash + time) |
| `airbases` | `NormalizedAirbase[]` | Yes | Normalized airbase context (always present, may be empty array) |
| `bullseyes` | `NormalizedBullseye[]` | Yes | Normalized bullseye reference points (always present, may be empty array) |
| `spots` | `NormalizedSpot[]` | Yes | Normalized laser/IR spots (always present, may be empty array) |
| `drawings` | `NormalizedDrawing[]` | Yes | Normalized map drawings/annotations (always present, may be empty array) |
| `logs` | `NormalizedLogEntry[]` | Yes | Normalized log entries from this poll cycle (always present, may be empty array) |
| `weaponsSummary` | `WeaponsSummary` | Yes | Basic weapons state summary (always present) |

**Validation Rules**:
- `base` must be a valid `OlympusSnapshot` (validated by spec-001)
- All array fields must always be present (never null/undefined, may be empty arrays)
- `weaponsSummary` must always be present (never null/undefined)

**State Transitions**: Immutable once created. New snapshots created on each `readContextOnce()` call.

**Relationships**:
- Contains one `OlympusSnapshot` (base snapshot)
- Contains multiple `NormalizedAirbase` entities
- Contains multiple `NormalizedBullseye` entities
- Contains multiple `NormalizedSpot` entities
- Contains multiple `NormalizedDrawing` entities
- Contains multiple `NormalizedLogEntry` entities
- Contains one `WeaponsSummary`

---

### 2. NormalizedAirbase (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Normalized airbase structure containing key identifiers, coalition information, and position data extracted from Olympus airbase endpoints.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Airbase identifier (critical field - must be present) |
| `name` | `string` | No | Airbase display name (optional) |
| `coalition` | `OlympusCoalition` | No | Coalition affiliation (BLUE, RED, NEUTRAL, UNKNOWN) |
| `position` | `OlympusUnitPosition` | No | Airbase coordinates (lat, lon, alt) |

**Validation Rules**:
- `id` is critical - if missing, log warning but still attempt normalization with available data (FR-011)
- All other fields are optional - missing fields do not trigger warnings
- Arrays must be sorted by `id` (ascending) for deterministic output (FR-015)

**Normalization Rules**:
- Extract from Olympus `/olympus/airbases` JSON response
- Preserve only fields listed above (drop all other Olympus fields)
- Sort by `id` before returning
- Handle missing `id` gracefully (log warning, skip entry or use fallback)

---

### 3. NormalizedBullseye (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Normalized bullseye structure containing coordinates and coalition associations extracted from Olympus bullseye endpoints.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Bullseye identifier (critical field - must be present) |
| `coalition` | `OlympusCoalition` | No | Coalition affiliation (BLUE, RED, NEUTRAL, UNKNOWN) |
| `position` | `OlympusUnitPosition` | No | Bullseye coordinates (lat, lon, alt) |

**Validation Rules**:
- `id` is critical - if missing, log warning but still attempt normalization with available data (FR-011)
- All other fields are optional
- Arrays must be sorted by `id` (ascending) for deterministic output (FR-015)

**Normalization Rules**:
- Extract from Olympus `/olympus/bullseyes` JSON response
- Preserve only fields listed above
- Sort by `id` before returning

---

### 4. NormalizedSpot (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Normalized spot structure containing position and type information for laser/IR markers extracted from Olympus spot endpoints.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Spot identifier (critical field - must be present) |
| `type` | `string` | No | Spot type (e.g., "laser", "IR", optional) |
| `position` | `OlympusUnitPosition` | No | Spot coordinates (lat, lon, alt) |

**Validation Rules**:
- `id` is critical - if missing, log warning but still attempt normalization with available data (FR-011)
- All other fields are optional
- Arrays must be sorted by `id` (ascending) for deterministic output (FR-015)

**Normalization Rules**:
- Extract from Olympus `/olympus/spots` JSON response
- Preserve only fields listed above
- Sort by `id` before returning

---

### 5. NormalizedDrawing (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Normalized drawing structure containing geometry and label information for map annotations extracted from Olympus drawing endpoints.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Drawing identifier (critical field - must be present) |
| `label` | `string` | No | Drawing label/text (optional) |
| `geometry` | `unknown` | No | Drawing geometry data (structure depends on drawing type, optional) |

**Validation Rules**:
- `id` is critical - if missing, log warning but still attempt normalization with available data (FR-011)
- All other fields are optional
- Arrays must be sorted by `id` (ascending) for deterministic output (FR-015)

**Normalization Rules**:
- Extract from Olympus `/olympus/drawings` JSON response
- Preserve only fields listed above
- Geometry structure may vary by drawing type - preserve as-is (no transformation)
- Sort by `id` before returning

---

### 6. NormalizedLogEntry (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Normalized log entry structure containing timestamp, category, and message content extracted from Olympus log endpoints. Preserves metadata needed for future event derivation.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Log entry identifier (critical field - must be present, may be generated if missing) |
| `timestamp` | `number` | No | Log timestamp in milliseconds since epoch |
| `category` | `string` | No | Log category/type (optional) |
| `message` | `string` | No | Log message content (optional) |
| `fields` | `Record<string, unknown>` | No | Additional log fields (optional, for future event derivation) |

**Validation Rules**:
- `id` is critical - if missing from Olympus, generate one (e.g., from timestamp) or log warning
- All other fields are optional
- Arrays must be sorted by `id` (ascending) for deterministic output (FR-015)
- Note: Logs may not have stable IDs from Olympus - may need to generate from timestamp+content hash

**Normalization Rules**:
- Extract from Olympus `/olympus/logs?time={t}` JSON response
- Preserve timestamp, category, message, and any additional fields
- Generate `id` if not present (e.g., hash of timestamp+message)
- Sort by `id` before returning

---

### 7. WeaponsSummary (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Basic weapons state summary containing last update time and active weapon count. Derived from decoded weapons data without full hostility interpretation.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lastUpdateTime` | `number` | Yes | Last update time from the weapons buffer (ms since epoch) |
| `activeCount` | `number` | Yes | Total number of active weapons currently tracked |

**Validation Rules**:
- Both fields are required (always present)
- `activeCount` must be non-negative integer
- `lastUpdateTime` must be valid timestamp (non-negative number)

**Derivation Rules**:
- Extract from decoded weapons structure (from `weapon-decoder.ts`)
- `lastUpdateTime`: Use latest `updateTime` from weapons buffer, or current time if buffer empty
- `activeCount`: Count of entries in decoded weapons array

---

## Relationships Summary

```
BfisContextSnapshot
├── base: OlympusSnapshot (1:1)
├── airbases: NormalizedAirbase[] (1:many)
├── bullseyes: NormalizedBullseye[] (1:many)
├── spots: NormalizedSpot[] (1:many)
├── drawings: NormalizedDrawing[] (1:many)
├── logs: NormalizedLogEntry[] (1:many)
└── weaponsSummary: WeaponsSummary (1:1)
```

## Data Flow

1. **Fetch**: `SnapshotReader` fetches raw JSON/binary from Olympus endpoints
2. **Normalize**: Context normalizers transform raw data into `Normalized*` structures
3. **Assemble**: `readContextOnce()` combines base snapshot + normalized context slices into `BfisContextSnapshot`
4. **Return**: Immutable `BfisContextSnapshot` returned to caller

## Error Handling

### Partial Data
- Missing critical fields (ID): Log warning, attempt normalization with available data (FR-011)
- Missing optional fields: No warning, normalize with available data
- Malformed data: Log decode error, return empty array for that slice (FR-009)

### Endpoint Failures
- HTTP errors: Log `bfis-snapshot-http-error` with endpoint name, return empty array (FR-008)
- Parse errors: Log `bfis-snapshot-decode-error` with endpoint context, return empty array (FR-009)
- All endpoints fail: Snapshot still created with base data + empty context arrays

## Deterministic Output Guarantees

Per FR-015:
- Same raw Olympus response → same normalized output
- Same field presence (no random omissions)
- Same ordering (sorted by ID, ascending)
- Same data types (no type coercion variations)

## Size Monitoring

Per FR-017:
- Log size warnings when any context slice contains 1000+ entries
- Use existing event name `bfis-snapshot-empty-data` extended with `endpoint` and `entryCount` fields
- Warnings are informational only - all data still included in snapshot

