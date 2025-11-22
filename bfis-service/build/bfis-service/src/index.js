/**
 * Main entry point for BFIS service.
 *
 * Per spec: BFIS operates in two main modes that share the same core loop:
 * - Autopilot: BFIS passively watches DCSOlympus, decides on actions on its own,
 *   and issues commands back to DCSOlympus
 * - Copilot: the player actively talks to BFIS, and BFIS uses an LLM to turn that
 *   intent into concrete actions and DCSOlympus commands
 *
 * Current behavior (bootstrap phase):
 * - Load configuration from env / creds.
 * - Log startup metadata (version, role, Olympus endpoints).
 * - Perform a single authenticated probe against /olympus/mission to verify connectivity.
 * - Stay alive with a lightweight heartbeat so the container remains running.
 *
 * Future behavior will replace the heartbeat with the full BFIS loop:
 * SnapshotReader → Decider → CommandAdapter → NDJSON Logger.
 *
 * The same machinery works whether BFIS is quietly automating background decisions
 * or acting as a chatty, voice-driven copilot.
 */
import { loadConfig } from "./config/config.js";
import { SnapshotReader } from "./snapshot/snapshot-reader.js";
import { createStructuredLogger } from "./logger/structured-logger.js";
import { PollingLoop } from "./runtime/polling-loop.js";
import { Orchestrator } from "./agents/orchestrator.js";
/**
 * Main application entry point.
 *
 * Orchestrates the BFIS service lifecycle:
 * 1. Load configuration from environment variables and credential files
 * 2. Initialize core components (SnapshotReader, Decider, CommandAdapter, Logger)
 * 3. Verify connectivity to Olympus via authenticated probe
 * 4. Enter main decision loop (future implementation)
 *
 * All errors are logged as JSON for structured logging and container monitoring.
 */
async function main() {
    const config = loadConfig();
    const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
    logger.info("bfis-startup", {
        bfisVersion: config.bfisVersion,
        logLevel: config.logLevel,
        olympusFrontendBaseUrl: config.olympusFrontendBaseUrl,
        olympusBaseUrl: config.olympusBaseUrl,
        olympusRole: config.olympusAuth.role,
        olympusUsername: config.olympusAuth.username,
    });
    const snapshotReader = new SnapshotReader(config, logger);
    // Connectivity probe: verify BFIS can reach Olympus and credentials are valid.
    // This fails fast if Olympus is unreachable or authentication is misconfigured.
    try {
        await snapshotReader.probeMissionOnce();
    }
    catch (err) {
        // Log probe failure but don't crash - allows container to start for debugging.
        logger.error("bfis-olympus-probe-error", {
            message: err instanceof Error ? err.message : String(err),
        });
    }
    // Initialize orchestrator for multi-agent decision cycles
    const orchestrator = new Orchestrator(config, logger);
    // Per T054a: Start polling loop to continuously poll Olympus endpoints
    // The polling loop calls snapshotReader.readContextOnce() at configured intervals,
    // handles session hash changes, and runs orchestrator cycles for each snapshot.
    const pollingLoop = new PollingLoop(config, logger, snapshotReader, orchestrator);
    pollingLoop.start();
    // Keep process alive - polling loop runs in background
    // Process will exit if polling loop stops (unhandled error) or container is stopped
}
// Execute main and handle any uncaught promise rejections
// Using void operator to explicitly ignore the promise (top-level await alternative)
void main();
