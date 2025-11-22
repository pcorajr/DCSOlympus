/**
 * Internal type definitions for BFIS context snapshots.
 * 
 * These types define the "richer picture" of the battlefield that BFIS uses
 * for decision-making. They are internal to BFIS and not part of the shared
 * contract with Olympus (though they wrap OlympusSnapshot).
 * 
 * @module ContextTypes
 */

import type { OlympusSnapshot, OlympusCoalition, OlympusUnitPosition } from "../../../shared-schemas/index.js";

/**
 * Unified snapshot containing all battlefield context in one place.
 * 
 * This is the primary output of SnapshotReader.readContextOnce().
 * It combines the base mission/units snapshot with all other context slices.
 * 
 * @see FR-007
 */
export interface BfisContextSnapshot {
  /** Core Olympus snapshot from shared schemas (mission + units + sessionHash + time). */
  base: OlympusSnapshot;

  /** Normalized airbase context (always present, may be empty array). */
  airbases: NormalizedAirbase[];

  /** Normalized bullseye reference points (always present, may be empty array). */
  bullseyes: NormalizedBullseye[];

  /** Normalized laser/IR spots (always present, may be empty array). */
  spots: NormalizedSpot[];

  /** Normalized map drawings/annotations (always present, may be empty array). */
  drawings: NormalizedDrawing[];

  /** Normalized log entries from this poll cycle (always present, may be empty array). */
  logs: NormalizedLogEntry[];

  /** Basic weapons state summary (always present). */
  weaponsSummary: WeaponsSummary;

  /**
   * Hostility awareness signal for this snapshot.
   * 
   * Indicates whether hostilities have started in the current mission session.
   * Always present, never null/undefined.
   * 
   * @see FR-006
   */
  hostility: HostilityAwareness;
}

/**
 * Normalized airbase structure.
 * 
 * Extracted from Olympus /olympus/airbases.
 * 
 * @see FR-001
 */
export interface NormalizedAirbase {
  /** Airbase identifier (critical field). */
  id: string;
  /** Airbase display name (optional). */
  name?: string;
  /** Coalition affiliation. */
  coalition?: OlympusCoalition;
  /** Airbase coordinates. */
  position?: OlympusUnitPosition;
}

/**
 * Normalized bullseye reference point.
 * 
 * Extracted from Olympus /olympus/bullseyes.
 * 
 * @see FR-002
 */
export interface NormalizedBullseye {
  /** Bullseye identifier (critical field). */
  id: string;
  /** Coalition affiliation. */
  coalition?: OlympusCoalition;
  /** Bullseye coordinates. */
  position?: OlympusUnitPosition;
}

/**
 * Normalized spot (laser/IR marker).
 * 
 * Extracted from Olympus /olympus/spots.
 * 
 * @see FR-003
 */
export interface NormalizedSpot {
  /** Spot identifier (critical field). */
  id: string;
  /** Spot type (e.g., "laser", "IR"). */
  type?: string;
  /** Spot coordinates. */
  position?: OlympusUnitPosition;
}

/**
 * Normalized map drawing/annotation.
 * 
 * Extracted from Olympus /olympus/drawings.
 * 
 * @see FR-004
 */
export interface NormalizedDrawing {
  /** Drawing identifier (critical field). */
  id: string;
  /** Drawing label/text (optional). */
  label?: string;
  /** Drawing geometry data (structure depends on drawing type). */
  geometry?: unknown;
}

/**
 * Normalized log entry.
 * 
 * Extracted from Olympus /olympus/logs.
 * Preserves metadata needed for future event derivation.
 * 
 * @see FR-005, FR-019
 */
export interface NormalizedLogEntry {
  /** Log entry identifier (critical field, may be generated). */
  id: string;
  /** Log timestamp in milliseconds since epoch. */
  timestamp?: number;
  /** Log category/type. */
  category?: string;
  /** Log message content. */
  message?: string;
  /** Additional log fields for future event derivation. */
  fields?: Record<string, unknown>;
}

/**
 * Basic weapons state summary.
 * 
 * Derived from decoded weapons binary data.
 * 
 * @see FR-006
 */
export interface WeaponsSummary {
  /** Last update time from the weapons buffer (ms since epoch). */
  lastUpdateTime: number;
  /** Total number of active weapons currently tracked. */
  activeCount: number;
}

/**
 * Hostility awareness signal for a mission session.
 * 
 * Provides a simple boolean signal that combat has begun, without attempting
 * to track ongoing attacks, identify targets, or assess threat levels.
 * 
 * @see FR-001, FR-002, FR-003
 */
export interface HostilityAwareness {
  /**
   * Whether hostilities have started in the current mission session.
   * 
   * Set to true when the first weapon is detected, remains true for the
   * entire mission session until sessionHash changes.
   */
  hostilitiesStarted: boolean;

  /**
   * Timestamp (ms since epoch) when hostilities were first detected.
   * 
   * Undefined if hostilities have not started yet.
   * Reset to undefined when sessionHash changes.
   */
  hostilitiesStartTime?: number;

  /**
   * Session hash this hostility state is associated with.
   * 
   * Used to detect mission resets and reset the hostility flag.
   * May be empty string if session hash is missing/invalid.
   */
  sessionHash: string;
}




