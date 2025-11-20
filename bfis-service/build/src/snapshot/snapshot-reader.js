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
import { decodeUnits } from "./unit-decoder.js";
import { decodeWeapons } from "./weapon-decoder.js";
import { normalizeAirbases, normalizeBullseyes, normalizeSpots, normalizeDrawings, normalizeLogs, buildWeaponsSummary } from "../context/normalizers.js";
/**
 * Convert Olympus role to command mode header value.
 *
 * The X-Command-Mode header tells Olympus which role's permissions to use
 * for the request. This enables coalition-restricted modes (post-MVP).
 *
 * @param role - Olympus authentication role
 * @returns Command mode string for X-Command-Mode header
 */
function roleToCommandMode(role) {
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
    config;
    logger;
    /**
     * Last known session hash from Olympus responses.
     *
     * Used to detect mission resets. When session hash changes, BFIS must
     * reset its state and perform full data refresh (time=0) for all endpoints.
     *
     * @see FR-008, FR-008a, FR-009
     */
    lastSessionHash = null;
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
    lastTimes = {};
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
    unitCache = new Map();
    /**
     * Weapon state cache - accumulates full weapon data across multiple polls.
     *
     * Key: weaponId (number)
     * Value: Complete DecodedWeapon with all fields populated
     *
     * This matches the frontend WeaponsManager pattern: maintain state between polls
     * and merge incremental updates. Delta encoding means we only get changed fields,
     * so we need to accumulate data over multiple cycles to get complete weapon info.
     *
     * Cache is cleared on session hash changes (mission reset).
     */
    weaponCache = new Map();
    /**
     * Create a new SnapshotReader with the given configuration.
     *
     * @param config - BFIS configuration containing Olympus URLs and auth
     * @param logger - Optional structured logger for probe and snapshot events
     */
    constructor(config, logger) {
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
    async probeMissionOnce() {
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
     * Validate snapshot fields for correctness.
     *
     * Per T063: Validates UUID format, coordinate ranges, and other field constraints.
     *
     * @param snapshot - Snapshot to validate
     * @throws Error if validation fails
     *
     * @private
     */
    validateSnapshot(snapshot) {
        // Validate UUID v4 format (8-4-4-4-12 hex digits)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(snapshot.snapshotId)) {
            throw new Error(`Invalid snapshotId format: ${snapshot.snapshotId}`);
        }
        // Validate and filter unit positions (coordinates in valid ranges)
        // Filter out corrupted units instead of throwing errors to prevent snapshot failure
        const validUnits = [];
        const invalidUnits = [];
        for (const unit of snapshot.units) {
            const pos = unit.position;
            let isValid = true;
            let reason = '';
            // Check for NaN or Infinity (data corruption)
            if (!isFinite(pos.lat) || !isFinite(pos.lon) || !isFinite(pos.altMeters)) {
                isValid = false;
                reason = `Non-finite coordinates (lat=${pos.lat}, lon=${pos.lon}, alt=${pos.altMeters})`;
            }
            // Validate latitude range
            if (isValid && (pos.lat < -90 || pos.lat > 90)) {
                isValid = false;
                reason = `Invalid latitude: ${pos.lat} (must be -90 to 90)`;
            }
            // Validate longitude range
            if (isValid && (pos.lon < -180 || pos.lon > 180)) {
                isValid = false;
                reason = `Invalid longitude: ${pos.lon} (must be -180 to 180)`;
            }
            // Category-aware altitude validation
            if (isValid) {
                const category = unit.category || 'Unknown';
                let minAltitude;
                if (category === 'NavyUnit' || category === 'Ship') {
                    // Naval units: Allow deep negative altitudes
                    // Surface ships typically -10m to -50m, submarines can be -500m or deeper
                    minAltitude = -1000;
                }
                else if (category === 'GroundUnit') {
                    // Ground units: Allow moderate negative altitudes for below-sea-level terrain
                    // Dead Sea area is -430m, Death Valley is -86m, other low-lying areas exist
                    minAltitude = -500;
                }
                else if (category === 'Aircraft' || category === 'Helicopter') {
                    // Aircraft: Should generally be above ground, but allow small negative
                    // for low-flying aircraft over below-sea-level terrain (e.g., Dead Sea at -430m)
                    minAltitude = -100;
                }
                else {
                    // Unknown category: Use conservative default to catch data corruption
                    minAltitude = -100;
                }
                if (pos.altMeters < minAltitude) {
                    isValid = false;
                    reason = `Invalid altitude: ${pos.altMeters}m (below minimum ${minAltitude}m for ${category})`;
                }
            }
            if (isValid) {
                validUnits.push(unit);
            }
            else {
                invalidUnits.push({ unitId: unit.unitId, reason });
                // Log warning for corrupted unit
                if (this.logger) {
                    this.logger.warn("bfis-snapshot-invalid-unit", {
                        unitId: unit.unitId,
                        category: unit.category || 'Unknown',
                        coalition: unit.coalition || 'UNKNOWN',
                        reason,
                        position: { lat: pos.lat, lon: pos.lon, altMeters: pos.altMeters },
                    });
                }
            }
        }
        // Replace units array with validated units
        snapshot.units = validUnits;
        // Log summary if any units were filtered
        if (invalidUnits.length > 0 && this.logger) {
            this.logger.warn("bfis-snapshot-filtered-units", {
                totalUnits: snapshot.units.length + invalidUnits.length,
                validUnits: validUnits.length,
                filteredUnits: invalidUnits.length,
                invalidUnitIds: invalidUnits.map(u => u.unitId),
            });
        }
    }
    /**
     * Log HTTP error with structured logging.
     *
     * Per FR-012, FR-013: Logs HTTP errors with URL, status, and message context
     * using structured logging (bfis-snapshot-http-error event).
     *
     * @param url - The URL that failed
     * @param status - HTTP status code
     * @param statusText - HTTP status text
     * @param message - Error message
     * @param endpoint - Endpoint name for context (e.g., "mission", "units")
     *
     * @private
     */
    logHttpError(url, status, statusText, message, endpoint) {
        if (this.logger) {
            this.logger.error("bfis-snapshot-http-error", {
                url,
                status,
                statusText,
                message,
                endpoint,
            });
        }
    }
    /**
     * Baseline data size tracking for large data detection.
     *
     * Per FR-014b, T061a: Tracks data sizes for first N snapshots per endpoint to establish
     * baseline averages, then warns when data exceeds threshold (default 2x baseline).
     */
    baselineSizes = {};
    baselineAverages = {};
    /**
     * Get baseline sample count from config or use default.
     *
     * @returns Number of samples to use for baseline (default 10)
     *
     * @private
     */
    getBaselineSampleCount() {
        const envValue = process.env.BFIS_LARGE_DATA_BASELINE_SAMPLES;
        if (envValue) {
            const parsed = parseInt(envValue, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 10; // Default
    }
    /**
     * Get large data multiplier from config or use default.
     *
     * @returns Multiplier for large data warning threshold (default 2.0)
     *
     * @private
     */
    getLargeDataMultiplier() {
        const envValue = process.env.BFIS_LARGE_DATA_MULTIPLIER;
        if (envValue) {
            const parsed = parseFloat(envValue);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 2.0; // Default
    }
    /**
     * Update baseline data size tracking and check for large data warnings.
     *
     * Per FR-014b, T061a, T061b: Establishes baseline from first N samples per endpoint,
     * then warns when data exceeds threshold (multiplier * baseline average).
     *
     * @param endpoint - Endpoint name (e.g., "units", "weapons")
     * @param size - Data size in bytes
     *
     * @private
     */
    updateBaselineAndCheckLargeData(endpoint, size) {
        const baselineCount = this.getBaselineSampleCount();
        const multiplier = this.getLargeDataMultiplier();
        // Initialize arrays if needed
        if (!this.baselineSizes[endpoint]) {
            this.baselineSizes[endpoint] = [];
        }
        const endpointSamples = this.baselineSizes[endpoint];
        // Collect baseline samples per endpoint
        if (endpointSamples.length < baselineCount) {
            endpointSamples.push(size);
            // If we've collected all baseline samples for this endpoint, compute average
            if (endpointSamples.length === baselineCount) {
                const sum = endpointSamples.reduce((a, b) => a + b, 0);
                this.baselineAverages[endpoint] = sum / endpointSamples.length;
                if (this.logger) {
                    this.logger.info("bfis-baseline-established", {
                        endpoint,
                        averageBytes: this.baselineAverages[endpoint],
                        samples: baselineCount,
                    });
                }
            }
        }
        else {
            // Baseline established for this endpoint - check for large data
            const baseline = this.baselineAverages[endpoint];
            if (baseline && size > baseline * multiplier) {
                if (this.logger) {
                    this.logger.warn("bfis-large-data-detected", {
                        endpoint,
                        currentBytes: size,
                        baselineBytes: baseline,
                        multiplier,
                        threshold: baseline * multiplier,
                    });
                }
            }
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
    checkSessionHash(newSessionHash, abortOnChange = false) {
        const sessionChanged = this.lastSessionHash !== null && this.lastSessionHash !== newSessionHash;
        if (sessionChanged) {
            const oldSessionHash = this.lastSessionHash;
            // Per FR-009: Reset internal state on session hash change
            this.unitCache.clear();
            this.weaponCache.clear();
            this.lastTimes = {}; // Clear lastTimes for full refresh on next poll
            // Reset baseline tracking on session change (new mission = new baseline)
            this.baselineSizes = {};
            this.baselineAverages = {};
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
                throw new Error(`Session hash changed mid-poll cycle: ${oldSessionHash} -> ${newSessionHash}. Aborting current poll to retry with fresh state.`);
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
    async fetchMission() {
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
            const errorMessage = `Failed to fetch mission: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "mission");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
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
    async fetchUnits(lastTime = 0) {
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
            const errorMessage = `Failed to fetch units: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "units");
            throw new Error(errorMessage);
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
    async fetchWeapons(lastTime = 0) {
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
            const errorMessage = `Failed to fetch weapons: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "weapons");
            throw new Error(errorMessage);
        }
        return await res.arrayBuffer();
    }
    /**
     * Fetch logs data from Olympus `/olympus/logs` endpoint.
     *
     * Per FR-010: Uses time query parameter for incremental updates.
     * Returns parsed JSON response with logs and metadata.
     *
     * @param lastTime - Optional last update time for incremental fetch (0 for full refresh)
     * @returns Parsed JSON response with logs array and metadata (time, sessionHash, etc.)
     * @throws Error if fetch fails or response cannot be parsed
     *
     * @see FR-010, FR-011
     */
    async fetchLogs(lastTime = 0) {
        const { olympusBaseUrl, olympusAuth } = this.config;
        const base = olympusBaseUrl.replace(/\/+$/, "");
        const url = lastTime > 0 ? `${base}/logs?time=${lastTime}` : `${base}/logs`;
        const username = olympusAuth.username;
        const password = olympusAuth.password;
        const commandMode = roleToCommandMode(olympusAuth.role);
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
            const errorMessage = `Failed to fetch logs: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "logs");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
        // Extract time and sessionHash from response
        const timeValue = data.time ?? Date.now();
        const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();
        const sessionHash = data.sessionHash ?? "";
        // Exclude time and sessionHash from spread to use our converted values
        const { time: _, sessionHash: __, ...rest } = data;
        return {
            logs: data.logs ?? [],
            time,
            sessionHash,
            ...rest,
        };
    }
    /**
     * Fetch airbases data from Olympus `/olympus/airbases` endpoint.
     *
     * Returns parsed JSON response with airbase information and metadata.
     *
     * @returns Parsed JSON response with airbases and metadata (time, sessionHash, etc.)
     * @throws Error if fetch fails or response cannot be parsed
     */
    async fetchAirbases() {
        const { olympusBaseUrl, olympusAuth } = this.config;
        const base = olympusBaseUrl.replace(/\/+$/, "");
        const url = `${base}/airbases`;
        const username = olympusAuth.username;
        const password = olympusAuth.password;
        const commandMode = roleToCommandMode(olympusAuth.role);
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
            const errorMessage = `Failed to fetch airbases: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "airbases");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
        const timeValue = data.time ?? Date.now();
        const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();
        const sessionHash = data.sessionHash ?? "";
        // Exclude time and sessionHash from spread to use our converted values
        const { time: _, sessionHash: __, ...rest } = data;
        return {
            airbases: data.airbases,
            time,
            sessionHash,
            ...rest,
        };
    }
    /**
     * Fetch bullseyes data from Olympus `/olympus/bullseyes` endpoint.
     *
     * Returns parsed JSON response with bullseye coordinates per coalition and metadata.
     *
     * @returns Parsed JSON response with bullseyes and metadata (time, sessionHash, etc.)
     * @throws Error if fetch fails or response cannot be parsed
     */
    async fetchBullseyes() {
        const { olympusBaseUrl, olympusAuth } = this.config;
        const base = olympusBaseUrl.replace(/\/+$/, "");
        const url = `${base}/bullseyes`;
        const username = olympusAuth.username;
        const password = olympusAuth.password;
        const commandMode = roleToCommandMode(olympusAuth.role);
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
            const errorMessage = `Failed to fetch bullseyes: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "bullseyes");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
        const timeValue = data.time ?? Date.now();
        const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();
        const sessionHash = data.sessionHash ?? "";
        // Exclude time and sessionHash from spread to use our converted values
        const { time: _, sessionHash: __, ...rest } = data;
        return {
            bullseyes: data.bullseyes,
            time,
            sessionHash,
            ...rest,
        };
    }
    /**
     * Fetch spots data from Olympus `/olympus/spots` endpoint.
     *
     * Returns parsed JSON response with current laser/IR spots and metadata.
     *
     * @returns Parsed JSON response with spots and metadata (time, sessionHash, etc.)
     * @throws Error if fetch fails or response cannot be parsed
     */
    async fetchSpots() {
        const { olympusBaseUrl, olympusAuth } = this.config;
        const base = olympusBaseUrl.replace(/\/+$/, "");
        const url = `${base}/spots`;
        const username = olympusAuth.username;
        const password = olympusAuth.password;
        const commandMode = roleToCommandMode(olympusAuth.role);
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
            const errorMessage = `Failed to fetch spots: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "spots");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
        const timeValue = data.time ?? Date.now();
        const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();
        const sessionHash = data.sessionHash ?? "";
        // Exclude time and sessionHash from spread to use our converted values
        const { time: _, sessionHash: __, ...rest } = data;
        return {
            spots: data.spots,
            time,
            sessionHash,
            ...rest,
        };
    }
    /**
     * Fetch drawings data from Olympus `/olympus/drawings` endpoint.
     *
     * Returns parsed JSON response with drawing data organized by layers and metadata.
     *
     * @returns Parsed JSON response with drawings and metadata (time, sessionHash, etc.)
     * @throws Error if fetch fails or response cannot be parsed
     *
     * @defect DRAWINGS-001: Endpoint returns empty objects - see normalizeDrawings() for details
     */
    async fetchDrawings() {
        const { olympusBaseUrl, olympusAuth } = this.config;
        const base = olympusBaseUrl.replace(/\/+$/, "");
        const url = `${base}/drawings`;
        const username = olympusAuth.username;
        const password = olympusAuth.password;
        const commandMode = roleToCommandMode(olympusAuth.role);
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
            const errorMessage = `Failed to fetch drawings: ${res.status} ${res.statusText} ${text}`;
            // Per FR-012, FR-013: Log HTTP error with structured logging
            this.logHttpError(url, res.status, res.statusText, errorMessage, "drawings");
            throw new Error(errorMessage);
        }
        const data = (await res.json());
        const timeValue = data.time ?? Date.now();
        const time = typeof timeValue === "string" ? new Date(Number(timeValue)).toISOString() : new Date(timeValue).toISOString();
        const sessionHash = data.sessionHash ?? "";
        // Exclude time and sessionHash from spread to use our converted values
        const { time: _, sessionHash: __, ...rest } = data;
        return {
            drawings: data.drawings,
            time,
            sessionHash,
            ...rest,
        };
    }
    /**
     * Read a complete snapshot from Olympus endpoints.
     *
     * Per FR-016: Fetches endpoints in specified order: mission, units (binary), weapons (binary),
     * logs, then airbases/bullseyes/spots/drawings.
     *
     * Per FR-007: Constructs snapshot with snapshotId, missionId, serverId, sessionHash,
     * timestamp, and decoded units array.
     *
     * Per FR-013, T062: If any endpoint fails during a poll cycle, the entire snapshot MUST fail
     * (no partial snapshots returned) and the system MUST retry on the next poll cycle.
     * All errors are logged with structured logging (bfis-snapshot-http-error, bfis-snapshot-decode-error).
     *
     * Per FR-015: Generates unique snapshot ID using UUID v4 format.
     *
     * Per FR-012: Logs `bfis-snapshot-read-ok` event with snapshot metadata including data size metrics.
     *
     * Per FR-010: Uses time query parameters for incremental updates (full refresh on first poll).
     *
     * Per FR-011: Updates lastTimes from response time fields and binary buffer updateTime values.
     *
     * Per FR-018, T064: Returns immutable snapshot objects that are not mutated after creation.
     *
     * Per T063: Validates snapshot fields (UUID format, coordinate ranges) before returning.
     *
     * @returns Complete OlympusSnapshot with mission data and decoded units
     * @throws Error if any endpoint fetch fails, decode fails, or snapshot construction/validation fails
     *
     * @see FR-007, FR-010, FR-011, FR-012, FR-013, FR-015, FR-016, FR-018
     */
    async readOnce() {
        // Per FR-016: Fetch endpoints in specified order: mission, units, weapons, logs, airbases, bullseyes, spots, drawings
        // 1. Fetch mission endpoint
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
        const logsLastTime = (isSessionReset ? 0 : this.lastTimes["logs"]) || 0;
        // 2. Fetch units (binary)
        const unitsBuffer = await this.fetchUnits(unitsLastTime);
        // Per FR-014a, T060: Check for empty data and log warning
        if (unitsBuffer.byteLength <= 8) {
            // Buffer only contains updateTime (8 bytes) or is empty
            if (this.logger) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "units",
                    bufferSize: unitsBuffer.byteLength,
                    message: "Empty or minimal units data received",
                });
            }
        }
        // Per FR-061c: Log binary fetch with mode and bytes for SC-006 measurement
        const unitsMode = isSessionReset ? "full" : "incremental";
        if (this.logger) {
            this.logger.info("bfis-binary-fetch", {
                endpoint: "units",
                mode: unitsMode,
                bytes: unitsBuffer.byteLength,
                lastTime: unitsLastTime,
            });
        }
        // Per FR-014b, T061a, T061b: Update baseline and check for large data
        this.updateBaselineAndCheckLargeData("units", unitsBuffer.byteLength);
        // 3. Fetch weapons (binary)
        const weaponsBuffer = await this.fetchWeapons(weaponsLastTime);
        // Per FR-014a, T060: Check for empty data and log warning
        if (weaponsBuffer.byteLength <= 8) {
            if (this.logger) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "weapons",
                    bufferSize: weaponsBuffer.byteLength,
                    message: "Empty or minimal weapons data received",
                });
            }
        }
        // Per FR-061c: Log binary fetch with mode and bytes
        const weaponsMode = isSessionReset ? "full" : "incremental";
        if (this.logger) {
            this.logger.info("bfis-binary-fetch", {
                endpoint: "weapons",
                mode: weaponsMode,
                bytes: weaponsBuffer.byteLength,
                lastTime: weaponsLastTime,
            });
        }
        // Per FR-014b, T061a, T061b: Update baseline and check for large data
        this.updateBaselineAndCheckLargeData("weapons", weaponsBuffer.byteLength);
        // Per FR-014, T059: Decode binary data with error handling
        let unitsUpdateTime;
        let units;
        try {
            const decoded = decodeUnits(unitsBuffer, this.logger);
            unitsUpdateTime = decoded.updateTime;
            units = decoded.units;
        }
        catch (error) {
            // Per FR-012, FR-014: Log decode error with structured logging
            if (this.logger) {
                this.logger.error("bfis-snapshot-decode-error", {
                    endpoint: "units",
                    bufferSize: unitsBuffer.byteLength,
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                });
            }
            throw new Error(`Failed to decode units: ${error instanceof Error ? error.message : String(error)}`);
        }
        let weaponsUpdateTime;
        try {
            const decoded = decodeWeapons(weaponsBuffer, this.weaponCache);
            weaponsUpdateTime = decoded.updateTime;
        }
        catch (error) {
            // Per FR-012, FR-014: Log decode error with structured logging
            if (this.logger) {
                this.logger.error("bfis-snapshot-decode-error", {
                    endpoint: "weapons",
                    bufferSize: weaponsBuffer.byteLength,
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                });
            }
            throw new Error(`Failed to decode weapons: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Per FR-011: Update lastTimes from decoded updateTime values (binary buffers)
        this.lastTimes["units"] = unitsUpdateTime;
        this.lastTimes["weapons"] = weaponsUpdateTime;
        // 4. Fetch logs (JSON with time parameter)
        const logsData = await this.fetchLogs(logsLastTime);
        // Per FR-014a, T060: Check for empty logs and log warning
        if (!Array.isArray(logsData.logs) || logsData.logs.length === 0) {
            if (this.logger) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "logs",
                    message: "Empty logs array received",
                });
            }
        }
        // Per FR-011: Update lastTimes from response time field (convert ISO string to number)
        const logsTimeNum = new Date(logsData.time).getTime();
        this.lastTimes["logs"] = logsTimeNum;
        // 5. Fetch airbases (JSON, no time parameter)
        const airbasesData = await this.fetchAirbases();
        // Per FR-011: Update lastTimes from response time field
        const airbasesTimeNum = new Date(airbasesData.time).getTime();
        this.lastTimes["airbases"] = airbasesTimeNum;
        // 6. Fetch bullseyes (JSON, no time parameter)
        const bullseyesData = await this.fetchBullseyes();
        // Per FR-011: Update lastTimes from response time field
        const bullseyesTimeNum = new Date(bullseyesData.time).getTime();
        this.lastTimes["bullseyes"] = bullseyesTimeNum;
        // 7. Fetch spots (JSON, no time parameter)
        const spotsData = await this.fetchSpots();
        // Per FR-011: Update lastTimes from response time field
        const spotsTimeNum = new Date(spotsData.time).getTime();
        this.lastTimes["spots"] = spotsTimeNum;
        // 8. Fetch drawings (JSON, no time parameter)
        const drawingsData = await this.fetchDrawings();
        // Per FR-011: Update lastTimes from response time field
        const drawingsTimeNum = new Date(drawingsData.time).getTime();
        this.lastTimes["drawings"] = drawingsTimeNum;
        // Per FR-015, T042: Generate new snapshotId on session reset (independent of previous)
        // If session reset occurred, generate new ID; otherwise use new UUID for each snapshot
        const snapshotId = randomUUID();
        // Construct snapshot with mission data and decoded units (FR-007)
        const snapshot = {
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
            }
            else {
                // New unit - add to cache
                this.unitCache.set(unit.unitId, unit);
            }
        }
        // Return snapshot with accumulated units from cache
        const accumulatedUnits = Array.from(this.unitCache.values());
        // Per FR-018, T064: Create immutable snapshot (no mutation after creation)
        // Using object spread and array spread to create new objects/arrays
        const snapshotWithCache = {
            snapshotId: snapshot.snapshotId,
            missionId: snapshot.missionId,
            serverId: snapshot.serverId,
            sessionHash: snapshot.sessionHash,
            time: snapshot.time,
            units: [...accumulatedUnits], // Create new array to ensure immutability
        };
        // Per T063: Validate snapshot fields (UUID format, coordinate ranges)
        this.validateSnapshot(snapshotWithCache);
        // Log snapshot read success (FR-012, T061)
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
    /**
     * Read a complete context snapshot including all environment data.
     *
     * Builds on readOnce() to extend the base snapshot with airbases, bullseyes, spots, drawings, logs, and weapons summary.
     *
     * Per spec-002 Section 5.1: This method calls readOnce() first to get the base snapshot (mission + units),
     * then fetches and normalizes the additional context endpoints.
     *
     * Per SC-001: Returns unified BfisContextSnapshot.
     * Per SC-002: Handles partial failures for context endpoints gracefully.
     * Per SC-006: Targets < 3s execution time via parallel fetching.
     *
     * @returns Complete BfisContextSnapshot
     */
    async readContextOnce() {
        // 1. Capture lastTimes before readOnce() updates them
        // readOnce() fetches logs and updates lastTimes["logs"], so we need the pre-readOnce() value
        const logsLastTimeBeforeRead = this.lastTimes["logs"] || 0;
        const weaponsLastTimeBeforeRead = this.lastTimes["weapons"] || 0;
        // 2. Get base snapshot (mission + units) via readOnce()
        // This handles session hash checking, unit caching, and all base snapshot logic
        // Note: readOnce() also fetches logs internally but doesn't return them
        const baseSnapshot = await this.readOnce();
        // 3. Determine incremental fetch parameters for context endpoints
        // For logs: use the pre-readOnce() value since readOnce() already fetched logs
        // For weapons: use the pre-readOnce() value (we need to fetch again for full data)
        // readOnce() already updated lastTimes, but we use the pre-update values for consistency
        const weaponsLastTime = weaponsLastTimeBeforeRead;
        const logsLastTime = logsLastTimeBeforeRead;
        // 3. Fetch additional context endpoints in parallel
        // Weapons are needed for weapons summary (readOnce() fetches but doesn't return full data)
        // Context endpoints are Non-Critical (Return empty on fail)
        const weaponsPromise = this.fetchWeapons(weaponsLastTime)
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/weapons${weaponsLastTime > 0 ? `?time=${weaponsLastTime}` : ""}`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "weapons",
                });
            }
            else {
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "weapons",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            // Return empty buffer on error (will result in zero weapons summary)
            return new ArrayBuffer(0);
        });
        const logsPromise = this.fetchLogs(logsLastTime)
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                // HTTP error - extract status if available
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/logs${logsLastTime > 0 ? `?time=${logsLastTime}` : ""}`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "logs",
                });
            }
            else {
                // Parse/decode error
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "logs",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            return { logs: [], time: baseSnapshot.time, sessionHash: baseSnapshot.sessionHash };
        });
        const airbasesPromise = this.fetchAirbases()
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/airbases`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "airbases",
                });
            }
            else {
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "airbases",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            return { airbases: [], time: baseSnapshot.time, sessionHash: baseSnapshot.sessionHash };
        });
        const bullseyesPromise = this.fetchBullseyes()
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/bullseyes`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "bullseyes",
                });
            }
            else {
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "bullseyes",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            return { bullseyes: {}, time: baseSnapshot.time, sessionHash: baseSnapshot.sessionHash };
        });
        const spotsPromise = this.fetchSpots()
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/spots`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "spots",
                });
            }
            else {
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "spots",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            return { spots: [], time: baseSnapshot.time, sessionHash: baseSnapshot.sessionHash };
        });
        const drawingsPromise = this.fetchDrawings()
            .catch(err => {
            // Per FR-008, FR-009: Log errors using existing event names from spec-001
            const errorMsg = err instanceof Error ? err.message : String(err);
            const baseUrl = this.config.olympusBaseUrl.replace(/\/+$/, "");
            if (errorMsg.includes("Failed to fetch")) {
                const statusMatch = errorMsg.match(/(\d{3})\s/);
                this.logger?.error("bfis-snapshot-http-error", {
                    url: `${baseUrl}/drawings`,
                    status: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
                    statusText: errorMsg.includes("Unauthorized") ? "Unauthorized" : undefined,
                    message: errorMsg,
                    endpoint: "drawings",
                });
            }
            else {
                this.logger?.error("bfis-snapshot-decode-error", {
                    endpoint: "drawings",
                    error: errorMsg,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                });
            }
            return { drawings: [], time: baseSnapshot.time, sessionHash: baseSnapshot.sessionHash };
        });
        // 4. Await all context endpoint fetches
        const [weaponsBuffer, logsData, airbasesData, bullseyesData, spotsData, drawingsData] = await Promise.all([
            weaponsPromise,
            logsPromise,
            airbasesPromise,
            bullseyesPromise,
            spotsPromise,
            drawingsPromise
        ]);
        // 5. Process Weapons (for weapons summary)
        let weaponsSummary;
        if (weaponsBuffer.byteLength > 0) {
            try {
                const decodedWeapons = decodeWeapons(weaponsBuffer, this.weaponCache);
                weaponsSummary = buildWeaponsSummary(decodedWeapons.weapons);
                // Update lastTimes for weapons (readOnce() already updated it, but we fetched again)
                // Only update if this is a new fetch (not from readOnce())
                if (!this.lastTimes["weapons"] || weaponsLastTime === 0) {
                    this.lastTimes["weapons"] = decodedWeapons.updateTime;
                }
            }
            catch (error) {
                this.logger?.error("bfis-snapshot-decode-error", { endpoint: "weapons", error: String(error) });
                // On decode error, return zeroed weapons summary
                weaponsSummary = { lastUpdateTime: 0, activeCount: 0 };
            }
        }
        else {
            // Empty buffer (error case) - return zeroed summary
            weaponsSummary = { lastUpdateTime: 0, activeCount: 0 };
        }
        // 6. Update Last Times for Context Endpoints
        if (logsData.time)
            this.lastTimes["logs"] = new Date(logsData.time).getTime();
        if (airbasesData.time)
            this.lastTimes["airbases"] = new Date(airbasesData.time).getTime();
        if (bullseyesData.time)
            this.lastTimes["bullseyes"] = new Date(bullseyesData.time).getTime();
        if (spotsData.time)
            this.lastTimes["spots"] = new Date(spotsData.time).getTime();
        if (drawingsData.time)
            this.lastTimes["drawings"] = new Date(drawingsData.time).getTime();
        // 7. Normalize Context Data
        const normalizedLogs = normalizeLogs(logsData);
        const normalizedAirbases = normalizeAirbases(airbasesData, this.logger);
        // Pass the bullseyes object, not the full response (which includes time/sessionHash)
        const normalizedBullseyes = normalizeBullseyes(bullseyesData.bullseyes ?? bullseyesData);
        const normalizedSpots = normalizeSpots(spotsData, this.logger);
        const normalizedDrawings = normalizeDrawings(drawingsData, this.logger);
        // 8. Check for large context data (FR-017)
        // Per FR-017: Use existing event name bfis-snapshot-empty-data extended with endpoint and entryCount
        const LARGE_CONTEXT_THRESHOLD = 1000;
        if (this.logger) {
            if (normalizedLogs.length >= LARGE_CONTEXT_THRESHOLD) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "logs",
                    entryCount: normalizedLogs.length,
                    threshold: LARGE_CONTEXT_THRESHOLD,
                });
            }
            if (normalizedAirbases.length >= LARGE_CONTEXT_THRESHOLD) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "airbases",
                    entryCount: normalizedAirbases.length,
                    threshold: LARGE_CONTEXT_THRESHOLD,
                });
            }
            if (normalizedBullseyes.length >= LARGE_CONTEXT_THRESHOLD) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "bullseyes",
                    entryCount: normalizedBullseyes.length,
                    threshold: LARGE_CONTEXT_THRESHOLD,
                });
            }
            if (normalizedSpots.length >= LARGE_CONTEXT_THRESHOLD) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "spots",
                    entryCount: normalizedSpots.length,
                    threshold: LARGE_CONTEXT_THRESHOLD,
                });
            }
            if (normalizedDrawings.length >= LARGE_CONTEXT_THRESHOLD) {
                this.logger.warn("bfis-snapshot-empty-data", {
                    endpoint: "drawings",
                    entryCount: normalizedDrawings.length,
                    threshold: LARGE_CONTEXT_THRESHOLD,
                });
            }
        }
        // 9. Assemble Context Snapshot
        const contextSnapshot = {
            base: baseSnapshot,
            airbases: normalizedAirbases,
            bullseyes: normalizedBullseyes,
            spots: normalizedSpots,
            drawings: normalizedDrawings,
            logs: normalizedLogs,
            weaponsSummary
        };
        // 10. Log Success
        if (this.logger) {
            this.logger.info("bfis-context-snapshot-ok", {
                snapshotId: baseSnapshot.snapshotId,
                sessionHash: baseSnapshot.sessionHash,
                unitCount: baseSnapshot.units.length,
                airbaseCount: normalizedAirbases.length,
                bullseyeCount: normalizedBullseyes.length,
                spotCount: normalizedSpots.length,
                drawingCount: normalizedDrawings.length,
                logCount: normalizedLogs.length,
                weaponCount: weaponsSummary.activeCount
            });
        }
        return contextSnapshot;
    }
}
