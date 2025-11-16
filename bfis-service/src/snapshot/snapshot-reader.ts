/**
 * Snapshot Reader - Polls Olympus endpoints and builds normalized snapshots.
 *
 * Bootstrap implementation:
 * - Provides a minimal `probeMissionOnce` method that performs a single
 *   authenticated GET against `/olympus/mission` to verify connectivity.
 *
 * Future implementation will:
 * - Poll units/weapons/logs/mission/airbases/bullseyes/spots/drawings at
 *   configured intervals and construct typed OlympusSnapshot objects.
 */

import type { BfisConfig } from "../config/config.js";

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

export class SnapshotReader {
  private readonly config: BfisConfig;

  constructor(config: BfisConfig) {
    this.config = config;
  }

  /**
   * Perform a single authenticated GET against /olympus/mission to verify
   * that BFIS can reach the Olympus frontend and has valid credentials.
   */
  async probeMissionOnce(): Promise<void> {
    const { olympusBaseUrl, olympusAuth } = this.config;

    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = `${base}/mission`;

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
      throw new Error(`Olympus mission probe failed: ${res.status} ${res.statusText} ${text}`);
    }

    // We do not parse the body yet; this is purely a connectivity/auth probe.
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
