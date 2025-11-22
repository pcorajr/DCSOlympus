/**
 * Shared TypeScript schemas for BFIS ⇄ Olympus data contract.
 * 
 * These types define the interface between BFIS and DCSOlympus. They are imported
 * by both bfis-service and potentially frontend code to ensure type safety and
 * prevent schema drift.
 * 
 * Per spec: This file contains all shared TypeScript interfaces:
 * - OlympusUnitPosition, OlympusCoalition, OlympusUnit
 * - OlympusEvent, OlympusSnapshot
 * - BfisActionType, BfisActionTarget, BfisActionParams, BfisAction
 * - BfisDecision, CommandStatus, CommandResult
 * 
 * TODO: Implement all interfaces from the BFIS ⇄ Olympus Simple Strategy spec.
 */

/**
 * Type-safe coalition identifier for units.
 * 
 * Represents the coalition a unit belongs to in the battlefield.
 * Used in OlympusSnapshot and OlympusUnit to identify unit allegiance.
 * 
 * @see OlympusUnit
 * @see OlympusSnapshot
 */
export type OlympusCoalition = "BLUE" | "RED" | "NEUTRAL" | "UNKNOWN";

/**
 * 3D position for a unit on the battlefield.
 * 
 * Represents geographic coordinates and altitude for unit positioning.
 * All coordinates are in standard units (degrees for lat/lon, meters for altitude).
 * 
 * @see OlympusUnit
 */
export interface OlympusUnitPosition {
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lon: number;
  /** Altitude in meters above sea level (non-negative) */
  altMeters: number;
}

/**
 * Represents a single unit on the battlefield.
 * 
 * Decoded from binary `/olympus/units` endpoint. Contains ALL available
 * information about a unit - NO fields are skipped or filtered.
 * 
 * CRITICAL: When capturing data, ALL fields from the binary decoder MUST be
 * included. This is a non-negotiable requirement for data capture operations.
 * 
 * @see OlympusSnapshot
 */
export interface OlympusUnit {
  /** Unique unit identifier (converted from uint32 in binary) */
  unitId: string;
  /** Group identifier if unit belongs to a group (converted from uint32, optional) */
  groupId?: string;
  /** Group name (optional) */
  groupName?: string;
  /** Unit display name (optional) */
  name?: string;
  /** Unit coalition (BLUE, RED, NEUTRAL, UNKNOWN) */
  coalition: OlympusCoalition;
  /** High-level category (e.g., "Aircraft", "Helicopter", "GroundUnit", "NavyUnit") */
  category: string;
  /** Specific unit type (e.g., "F-16C_50", "AH-64D") */
  unitType?: string;
  /** Unit position (lat, lon, altitude) */
  position: OlympusUnitPosition;
  /** Unit status/state (e.g., "idle", "attack", "follow", optional) */
  status?: string;
  /** Whether this unit is human-controlled (player) */
  human?: boolean;
  /** Whether this unit is AI-controlled */
  controlled?: boolean;
  /** Whether unit is alive */
  alive?: boolean;
  /** Alarm state */
  alarmState?: number;
  /** Radar state */
  radarState?: boolean;
  /** Country code */
  country?: number;
  /** Unit name (secondary field) */
  unitName?: string;
  /** Callsign */
  callsign?: string;
  /** Speed in m/s */
  speed?: number;
  /** Horizontal velocity */
  horizontalVelocity?: number;
  /** Vertical velocity */
  verticalVelocity?: number;
  /** Heading in radians */
  heading?: number;
  /** Track in radians */
  track?: number;
  /** Is active tanker */
  isActiveTanker?: boolean;
  /** Is active AWACS */
  isActiveAWACS?: boolean;
  /** On/off state */
  onOff?: boolean;
  /** Follow roads */
  followRoads?: boolean;
  /** Fuel level */
  fuel?: number;
  /** Desired speed */
  desiredSpeed?: number;
  /** Desired speed type */
  desiredSpeedType?: string;
  /** Desired altitude */
  desiredAltitude?: number;
  /** Desired altitude type */
  desiredAltitudeType?: string;
  /** Leader ID */
  leaderID?: number;
  /** Formation offset */
  formationOffset?: { x: number; y: number; z: number };
  /** Target ID */
  targetID?: number;
  /** Target position */
  targetPosition?: OlympusUnitPosition;
  /** Rules of Engagement */
  ROE?: string;
  /** Reaction to threat */
  reactionToThreat?: string;
  /** Emissions countermeasures */
  emissionsCountermeasures?: string;
  /** TACAN settings */
  TACAN?: any;
  /** Radio settings */
  radio?: any;
  /** General settings */
  generalSettings?: any;
  /** Ammo data */
  ammo?: any[];
  /** Contacts data */
  contacts?: any[];
  /** Active path */
  activePath?: any[];
  /** Is leader */
  isLeader?: boolean;
  /** Operate as */
  operateAs?: number;
  /** Shots scatter */
  shotsScatter?: number;
  /** Shots intensity */
  shotsIntensity?: number;
  /** Health */
  health?: number;
  /** Racetrack length */
  racetrackLength?: number;
  /** Racetrack anchor */
  racetrackAnchor?: OlympusUnitPosition;
  /** Racetrack bearing */
  racetrackBearing?: number;
  /** Time to next tasking */
  timeToNextTasking?: number;
  /** Barrel height */
  barrelHeight?: number;
  /** Muzzle velocity */
  muzzleVelocity?: number;
  /** Aim time */
  aimTime?: number;
  /** Shots to fire */
  shotsToFire?: number;
  /** Shots base interval */
  shotsBaseInterval?: number;
  /** Shots base scatter */
  shotsBaseScatter?: number;
  /** Engagement range */
  engagementRange?: number;
  /** Targeting range */
  targetingRange?: number;
  /** Aim method range */
  aimMethodRange?: number;
  /** Acquisition range */
  acquisitionRange?: number;
  /** Airborne */
  airborne?: boolean;
  /** Cargo weight */
  cargoWeight?: number;
  /** Drawing arguments */
  drawingArguments?: any[];
  /** Custom string */
  customString?: string;
  /** Custom integer */
  customInteger?: number;
  /** Task */
  task?: string;
  /** Has task */
  hasTask?: boolean;
}

/**
 * Represents a battlefield event derived from logs or snapshot diffing.
 * 
 * Events capture significant state changes in the battlefield (e.g., unit destroyed,
 * unit spawned, mission start). Events are optional in MVP and may be derived
 * from log analysis or snapshot comparison.
 * 
 * @see OlympusSnapshot
 */
export interface OlympusEvent {
  /** Unique event identifier (generated by BFIS) */
  eventId: string;
  /** ISO 8601 timestamp of event */
  time: string;
  /** Event type (e.g., "unit_destroyed", "unit_spawned", "mission_start") */
  type: string;
  /** Associated unit ID if applicable (optional) */
  unitId?: string;
  /** Additional event-specific data (optional) */
  details?: Record<string, unknown>;
}

/**
 * Represents a point-in-time view of the battlefield state as reported by Olympus.
 * 
 * This is the primary output of `SnapshotReader.readOnce()`. Contains mission
 * metadata, all units on the battlefield, and optional events. Snapshots are
 * immutable once created (FR-018).
 * 
 * @see SnapshotReader.readOnce
 */
export interface OlympusSnapshot {
  /** UUID v4 identifier for this snapshot (generated by BFIS) */
  snapshotId: string;
  /** Mission identifier from Olympus `/olympus/mission` response */
  missionId: string;
  /** Server identifier from Olympus `/olympus/mission` response */
  serverId: string;
  /** Olympus session hash used to detect mission resets */
  sessionHash: string;
  /** ISO 8601 timestamp of snapshot creation (from latest endpoint response) */
  time: string;
  /** Array of decoded units (always present, may be empty) */
  units: OlympusUnit[];
  /** Optional derived events from logs or snapshot diffing (MVP: optional) */
  events?: OlympusEvent[];
}

/**
 * Type-safe action type for BFIS decisions.
 *
 * Represents the high-level action types that BFIS can produce.
 */
export type BfisActionType = "SPAWN" | "MOVE" | "ATTACK" | "RTB" | "HOLD" | "CUSTOM";

/**
 * Target specification for a BFIS action.
 *
 * Actions can target units, groups, coordinates, or zones.
 */
export interface BfisActionTarget {
  /** Target unit ID (optional). */
  unitId?: string;
  /** Target group ID (optional). */
  groupId?: string;
  /** Target coordinate reference (optional). */
  coordinateRef?: { lat: number; lon: number; altMeters?: number };
  /** Target zone ID (optional). */
  zoneId?: string;
}

/**
 * Parameters for a BFIS action.
 *
 * Action-specific parameters vary by action type.
 */
export interface BfisActionParams {
  unitType?: string;
  count?: number;
  speedKts?: number;
  altitudeMeters?: number;
  waypointId?: string;
  notes?: string;
  coalition?: OlympusCoalition;
  category?: string;
  path?: Array<{ lat: number; lon: number; altMeters?: number }>;
  weaponType?: string;
  [key: string]: unknown;
}

/**
 * Represents a single action in a BFIS decision.
 *
 * Actions are high-level tactical commands that will be translated
 * into concrete Olympus commands by the Writer agent.
 */
export interface BfisAction {
  /** Action type (SPAWN, MOVE, ATTACK, etc.). */
  type: BfisActionType;
  /** Action target (unit, group, coordinate, or zone). */
  target: BfisActionTarget;
  /** Action-specific parameters. */
  params?: BfisActionParams;
}

/**
 * Represents a tactical decision made by BFIS.
 *
 * Decisions contain one or more actions with reasoning notes explaining
 * why those actions were chosen. This is the output of the Commander agent.
 */
export interface BfisDecision {
  /** Unique decision identifier (UUID v4). */
  decisionId: string;
  /** Snapshot ID this decision is based on. */
  snapshotId?: string;
  /** Mission ID this decision applies to. */
  missionId?: string;
  /** Server ID this decision applies to. */
  serverId?: string;
  /** LLM model used (if LLM-driven decision). */
  model?: string;
  /** Reasoning notes explaining why these actions were chosen. */
  reasoningNotes?: string;
  /** List of actions to execute. */
  actions: BfisAction[];
  /** ISO 8601 timestamp when decision was made. */
  timestamp?: string;
}
