/**
 * Snapshot Reader - Polls Olympus endpoints and builds normalized snapshots.
 *
 * Per spec: This component is responsible for:
 * - Ingesting state: polling DCSOlympus for mission state, units, weapons, and logs
 * - Turning that into a compact internal snapshot (OlympusSnapshot)
 *
 * Bootstrap implementation:
 * - Provides a minimal `probeMissionOnce` method that performs a single
 *   authenticated GET against `/olympus/mission` to verify connectivity.
 *
 * Future implementation will:
 * - Poll units/weapons/logs/mission/airbases/bullseyes/spots/drawings at
 *   configured intervals and construct typed OlympusSnapshot objects.
 * - Decode binary data from units/weapons endpoints using the binary decoder
 * - Combine data from multiple endpoints into a single normalized snapshot
 * - Track polling state to avoid redundant requests
 *
 * Polling strategy (MVP default):
 * - Units/weapons (binary): every 2000ms (full + incremental as needed)
 * - Logs: every 1000ms
 * - Mission/airbases/bullseyes/spots: every 5000-10000ms
 */

import { v4 as randomUUID } from "uuid";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { OlympusSnapshot, OlympusUnit } from "../../../shared-schemas/index.js";
import { decodeUnits } from "./unit-decoder.js";
import { decodeWeapons } from "./weapon-decoder.js";

/**
 * Convert Olympus role to command mode header value.
 *
 * The X-Command-Mode header tells Olympus which role's permissions to use
 * for the request. This enables coalition-restricted modes (post-MVP).
 *
 * @param role - Olympus authentication role
 * @returns Command mode string for X-Command-Mode header
 */
function roleToCommandMode(role: string): string {
  switch (role) {
    case "BLUE_COMMANDER":
      return "Blue commander";
    case "RED_COMMANDER":
      return "Red commander";
    case "ADMIN":
      return "Admin";
    case "GAME_MASTER":
    default:
      return "Game master";
  }
}

/**
 * SnapshotReader polls Olympus endpoints and builds normalized snapshots.
 *
 * This class encapsulates all logic for communicating with Olympus endpoints,
 * decoding responses, and constructing the internal snapshot representation
 * that the rest of BFIS uses for decision-making.
 * 
 * Session state tracking:
 * - `lastSessionHash`: Tracks the last known session hash to detect mission resets
 * - `lastTimes`: Tracks last update time per endpoint for incremental polling
 */
export class SnapshotReader {
  private readonly config: BfisConfig;
  private readonly logger?: StructuredLogger;
  
  /**
   * Last known session hash from Olympus responses.
   * 
   * Used to detect mission resets. When session hash changes, BFIS must
   * reset its state and perform full data refresh (time=0) for all endpoints.
   * 
   * @see FR-008, FR-008a, FR-009
   */
  private lastSessionHash: string | null = null;
  
  /**
   * Last update time per endpoint for incremental polling.
   * 
   * Tracks the last known update time for units, weapons, and logs endpoints.
   * Used to construct time query parameters (e.g., `?time={lastTime}`) for
   * incremental updates, reducing data transfer when no changes occur.
   * 
   * Keys: "units", "weapons", "logs"
   * Values: Milliseconds since epoch (from response time fields or binary updateTime)
   * 
   * @see FR-010, FR-011
   */
  private lastTimes: Record<string, number> = {};

  /**
   * Unit state cache - accumulates full unit data across multiple polls.
   * 
   * Key: unitId (string)
   * Value: Complete OlympusUnit with all fields populated
   * 
   * This matches the frontend UnitsManager pattern: maintain state between polls
   * and merge incremental updates. Delta encoding means we only get changed fields,
   * so we need to accumulate data over multiple cycles to get complete unit info.
   * 
   * Cache is cleared on session hash changes (mission reset).
   */
  private unitCache: Map<string, OlympusUnit> = new Map();

  /**
   * Create a new SnapshotReader with the given configuration.
   *
   * @param config - BFIS configuration containing Olympus URLs and auth
   * @param logger - Optional structured logger for probe and snapshot events
   */
  constructor(config: BfisConfig, logger?: StructuredLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Perform a single authenticated GET against /olympus/mission to verify
   * that BFIS can reach the Olympus frontend and has valid credentials.
   *
   * This is a connectivity and authentication probe used during startup (FR-002).
   * It does not parse the response body - only verifies the request succeeds.
   * 
   * Per FR-002: System MUST perform an initial connectivity probe on startup
   * to verify Olympus availability and credentials.
   * 
   * On success, logs `bfis-olympus-probe-ok` event with URL and status.
   * On failure, throws Error with status and message for caller to handle.
   *
   * @throws Error if the request fails (network error, auth failure, etc.)
   * 
   * @see FR-002
   */
  async probeMissionOnce(): Promise<void> {
    const { olympusBaseUrl, olympusAuth } = this.config;

    // Normalize URL to remove trailing slashes
    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = `${base}/mission`;

    const username = olympusAuth.username;
    const password = olympusAuth.password;
    const commandMode = roleToCommandMode(olympusAuth.role);
    // Basic auth: base64 encode username:password
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    // Authenticated request with command mode header
    // The X-Command-Mode header determines which role's permissions are used
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        "X-Command-Mode": commandMode,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      // Include response body in error for debugging auth/connectivity issues
      const text = await res.text().catch(() => "");
      throw new Error(`Olympus mission probe failed: ${res.status} ${res.statusText} ${text}`);
    }

    // We do not parse the body yet; this is purely a connectivity/auth probe.
    // Future implementation will parse the mission response to extract missionId,
    // serverId, and sessionHash for snapshot construction.
    if (this.logger) {
      this.logger.info("bfis-olympus-probe-ok", { url, status: res.status });
    }
  }

  /**
   * Check if session hash has changed and handle reset if needed.
   * 
   * Per FR-008: Detects session hash changes to identify mission resets.
   * Per FR-008a: Throws error if session hash changes mid-poll cycle to trigger abort and retry.
   * Per FR-009: Resets internal state (lastTimes, unitCache) when session hash changes.
   * 
   * @param newSessionHash - The session hash from the current response
   * @param abortOnChange - If true, throws error on change to abort current poll cycle (FR-008a)
   * @returns true if session hash changed, false otherwise
   * @throws Error if session hash changed and abortOnChange is true
   * 
   * @private
   */
  private checkSessionHash(newSessionHash: string, abortOnChange: boolean = false): boolean {
    const sessionChanged = this.lastSessionHash !== null && this.lastSessionHash !== newSessionHash;
    
    if (sessionChanged) {
      const oldSessionHash = this.lastSessionHash;
      
      // Per FR-009: Reset internal state on session hash change
      this.unitCache.clear();
      this.lastTimes = {}; // Clear lastTimes for full refresh on next poll
      
      // Per T041: Update lastSessionHash to new value so next poll treats it as new session
      // This must happen before throwing to ensure retry doesn't see it as a change again
      this.lastSessionHash = newSessionHash;
      
      // Per FR-012: Log session reset event
      if (this.logger) {
        this.logger.info("bfis-session-reset", {
          oldSessionHash,
          newSessionHash,
          clearedUnitCount: this.unitCache.size,
        });
      }
      
      // Per FR-008a: Abort current poll cycle if change detected mid-poll
      if (abortOnChange) {
        throw new Error(
          `Session hash changed mid-poll cycle: ${oldSessionHash} -> ${newSessionHash}. Aborting current poll to retry with fresh state.`
        );
      }
    }
    
    return sessionChanged;
  }

  /**
   * Fetch mission data from Olympus `/olympus/mission` endpoint.
   * 
   * Performs authenticated GET request and parses JSON response to extract
   * mission metadata including missionId, serverId, sessionHash, and time.
   * 
   * @returns Parsed mission data with missionId, serverId, sessionHash, and time
   * @throws Error if HTTP request fails or response cannot be parsed
   * 
   * @private
   */
  private async fetchMission(): Promise<{
    missionId: string;
    serverId: string;
    sessionHash: string;
    time: string;
  }> {
    const { olympusBaseUrl, olympusAuth } = this.config;

    // Normalize URL to remove trailing slashes
    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = `${base}/mission`;

    const username = olympusAuth.username;
    const password = olympusAuth.password;
    const commandMode = roleToCommandMode(olympusAuth.role);
    // Basic auth: base64 encode username:password
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        "X-Command-Mode": commandMode,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch mission: ${res.status} ${res.statusText} ${text}`);
    }

    const data = (await res.json()) as {
      mission?: {
        theatre?: string;
        [key: string]: unknown;
      };
      time?: string | number;
      sessionHash?: string;
      [key: string]: unknown;
    };

    // Extract sessionHash and time from response
    const sessionHash = data.sessionHash ?? "";
    const timeValue = data.time ?? Date.now();
    // Convert time to ISO 8601 string (handle both string and number formats)
    const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();

    // Extract missionId from mission.theatre or use sessionHash as fallback
    const missionId = data.mission?.theatre ?? (sessionHash || "unknown");

    // Extract serverId - use config base URL hostname or sessionHash as fallback
    // In MVP, serverId is not explicitly in the response, so we derive it from config
    const serverId = new URL(this.config.olympusBaseUrl).hostname || "localhost";

    return {
      missionId,
      serverId,
      sessionHash,
      time,
    };
  }

  /**
   * Fetch binary units data from Olympus `/olympus/units` endpoint.
   * 
   * Per FR-010: Uses time query parameter for incremental updates.
   * Returns the raw ArrayBuffer for decoding.
   * 
   * @param lastTime - Optional last update time for incremental fetch (0 for full refresh)
   * @returns ArrayBuffer containing binary units data
   * @throws Error if fetch fails
   * 
   * @see FR-010, FR-011
   */
  private async fetchUnits(lastTime: number = 0): Promise<ArrayBuffer> {
    const { olympusBaseUrl, olympusAuth } = this.config;
    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = lastTime > 0 ? `${base}/units?time=${lastTime}` : `${base}/units`;

    const username = olympusAuth.username;
    const password = olympusAuth.password;
    const commandMode = roleToCommandMode(olympusAuth.role);
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        "X-Command-Mode": commandMode,
        Accept: "application/octet-stream",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch units: ${res.status} ${res.statusText} ${text}`);
    }

    return await res.arrayBuffer();
  }

  /**
   * Fetch binary weapons data from Olympus `/olympus/weapons` endpoint.
   * 
   * Per FR-010: Uses time query parameter for incremental updates.
   * Returns the raw ArrayBuffer for decoding.
   * 
   * @param lastTime - Optional last update time for incremental fetch (0 for full refresh)
   * @returns ArrayBuffer containing binary weapons data
   * @throws Error if fetch fails
   * 
   * @see FR-010, FR-011
   */
  private async fetchWeapons(lastTime: number = 0): Promise<ArrayBuffer> {
    const { olympusBaseUrl, olympusAuth } = this.config;
    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = lastTime > 0 ? `${base}/weapons?time=${lastTime}` : `${base}/weapons`;

    const username = olympusAuth.username;
    const password = olympusAuth.password;
    const commandMode = roleToCommandMode(olympusAuth.role);
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        "X-Command-Mode": commandMode,
        Accept: "application/octet-stream",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch weapons: ${res.status} ${res.statusText} ${text}`);
    }

    return await res.arrayBuffer();
  }

  /**
   * Read a complete snapshot from Olympus endpoints.
   * 
   * Fetches mission, units, and weapons data and constructs a normalized OlympusSnapshot object.
   * 
   * Per FR-007: Constructs snapshot with snapshotId, missionId, serverId, sessionHash,
   * timestamp, and decoded units array.
   * 
   * Per FR-015: Generates unique snapshot ID using UUID v4 format.
   * 
   * Per FR-012: Logs `bfis-snapshot-read-ok` event with snapshot metadata.
   * 
   * Per FR-010: Uses time query parameters for incremental updates (full refresh on first poll).
   * 
   * @returns Complete OlympusSnapshot with mission data and decoded units
   * @throws Error if any endpoint fetch fails or snapshot construction fails
   * 
   * @see FR-007, FR-010, FR-012, FR-015
   */
  async readOnce(): Promise<OlympusSnapshot> {
    // Fetch mission endpoint
    const missionData = await this.fetchMission();

    // Per FR-008: Check session hash after mission fetch
    // Per FR-008a: If session hash changes between endpoints (mid-poll), we would abort,
    // but since we only check after mission fetch, we handle session changes gracefully:
    // reset state, log event, and continue with full refresh
    const isFirstPoll = this.lastSessionHash === null;
    const sessionChangedBeforeCheck = !isFirstPoll && this.lastSessionHash !== missionData.sessionHash;
    
    // Check if session changed - this will reset state and log event (but not throw for between-polls changes)
    // FR-008a mid-poll abort would require checking after each endpoint, which is not implemented in MVP
    if (!isFirstPoll) {
      this.checkSessionHash(missionData.sessionHash, false);
    }

    // Per FR-017: Use time=0 for full refresh on session reset or initial poll
    // If first poll, session was reset (detected before checkSessionHash updated lastSessionHash),
    // or lastTimes is empty (indicating recent reset), use full refresh
    const isSessionReset = isFirstPoll || sessionChangedBeforeCheck || Object.keys(this.lastTimes).length === 0;
    const unitsLastTime = (isSessionReset ? 0 : this.lastTimes["units"]) || 0;
    const weaponsLastTime = (isSessionReset ? 0 : this.lastTimes["weapons"]) || 0;

    // Fetch units and weapons (full refresh on session reset, incremental otherwise)
    const unitsBuffer = await this.fetchUnits(unitsLastTime);
    
    // Per FR-008a: Re-check session hash after each endpoint fetch
    // Since only mission endpoint returns session hash, we re-fetch mission to check
    // In practice, if session changes mid-poll, we'll detect it on next poll cycle
    // For now, we check after mission fetch and abort if changed
    
    const weaponsBuffer = await this.fetchWeapons(weaponsLastTime);

    // Decode binary data
    const { updateTime: unitsUpdateTime, units } = decodeUnits(unitsBuffer, this.logger);
    const { updateTime: weaponsUpdateTime } = decodeWeapons(weaponsBuffer);

    // Update lastTimes from decoded updateTime values
    this.lastTimes["units"] = unitsUpdateTime;
    this.lastTimes["weapons"] = weaponsUpdateTime;

    // Per FR-015, T042: Generate new snapshotId on session reset (independent of previous)
    // If session reset occurred, generate new ID; otherwise use new UUID for each snapshot
    const snapshotId = randomUUID();

    // Construct snapshot with mission data and decoded units (FR-007)
    const snapshot: OlympusSnapshot = {
      snapshotId,
      missionId: missionData.missionId,
      serverId: missionData.serverId,
      sessionHash: missionData.sessionHash,
      time: missionData.time,
      units, // Decoded units from binary buffer
    };

    // Per T041: Update lastSessionHash after successful poll
    this.lastSessionHash = missionData.sessionHash;

    // Merge decoded units into cache (accumulate full data across polls)
    // Delta encoding means we only get changed fields, so we merge updates into cached state
    for (const unit of units) {
      const existingUnit = this.unitCache.get(unit.unitId);
      if (existingUnit) {
        // Merge: update existing unit with new data (new fields override old)
        this.unitCache.set(unit.unitId, {
          ...existingUnit,
          ...unit,
          // Preserve position if new one is default (0,0,0) and we have a real position
          position: unit.position.lat === 0 && unit.position.lon === 0 && unit.position.altMeters === 0
            ? existingUnit.position
            : unit.position,
        });
      } else {
        // New unit - add to cache
        this.unitCache.set(unit.unitId, unit);
      }
    }

    // Return snapshot with accumulated units from cache
    const accumulatedUnits: OlympusUnit[] = Array.from(this.unitCache.values());
    const snapshotWithCache: OlympusSnapshot = {
      ...snapshot,
      units: accumulatedUnits,
    };

    // Log snapshot read success (FR-012)
    if (this.logger) {
      this.logger.info("bfis-snapshot-read-ok", {
        snapshotId,
        sessionHash: missionData.sessionHash,
        unitCount: accumulatedUnits.length,
        newUnitsInPoll: units.length,
        cachedUnitsTotal: this.unitCache.size,
        unitsBufferSize: unitsBuffer.byteLength,
        weaponsBufferSize: weaponsBuffer.byteLength,
      });
    }

    return snapshotWithCache;
  }
}
