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

import type { BfisConfig } from "../config/config.js";

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
 */
export class SnapshotReader {
  private readonly config: BfisConfig;

  /**
   * Create a new SnapshotReader with the given configuration.
   *
   * @param config - BFIS configuration containing Olympus URLs and auth
   */
  constructor(config: BfisConfig) {
    this.config = config;
  }

  /**
   * Perform a single authenticated GET against /olympus/mission to verify
   * that BFIS can reach the Olympus frontend and has valid credentials.
   *
   * This is a connectivity and authentication probe used during startup.
   * It does not parse the response body - only verifies the request succeeds.
   *
   * @throws Error if the request fails (network error, auth failure, etc.)
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
    console.log(
      JSON.stringify({
        event: "bfis-olympus-probe-ok",
        ts: new Date().toISOString(),
        url,
        status: res.status,
      })
    );
  }
}
