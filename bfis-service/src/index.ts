/**
 * Main entry point for BFIS service.
 *
 * Current behavior (bootstrap phase):
 * - Load configuration from env / creds.
 * - Log startup metadata (version, role, Olympus endpoints).
 * - Perform a single authenticated probe against /olympus/mission to verify connectivity.
 * - Stay alive with a lightweight heartbeat so the container remains running.
 *
 * Future behavior will replace the heartbeat with the full BFIS loop:
 * SnapshotReader → Decider → CommandAdapter → NDJSON Logger.
 */

import { loadConfig } from "./config/config.js";
import { SnapshotReader } from "./snapshot/snapshot-reader.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Human-friendly startup line for docker logs.
  console.log(
    JSON.stringify({
      event: "bfis-startup",
      ts: new Date().toISOString(),
      bfisVersion: config.bfisVersion,
      logLevel: config.logLevel,
      olympusFrontendBaseUrl: config.olympusFrontendBaseUrl,
      olympusBaseUrl: config.olympusBaseUrl,
      olympusRole: config.olympusAuth.role,
      olympusUsername: config.olympusAuth.username,
    })
  );

  const snapshotReader = new SnapshotReader(config);

  try {
    await snapshotReader.probeMissionOnce();
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "bfis-olympus-probe-error",
        ts: new Date().toISOString(),
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  // Minimal heartbeat to keep the process/container alive for now.
  setInterval(() => {
    console.log(
      JSON.stringify({
        event: "bfis-heartbeat",
        ts: new Date().toISOString(),
      })
    );
  }, 60_000);
}

void main();
