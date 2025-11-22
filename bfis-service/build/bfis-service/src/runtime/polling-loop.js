/**
 * Polling loop orchestrator for BFIS snapshot ingestion.
 *
 * This module manages the continuous polling of Olympus endpoints by calling
 * `SnapshotReader.readContextOnce()` at configured intervals. It handles:
 * - Timing: Calls readContextOnce() at intervals from BfisConfig.polling
 * - Session hash changes: Detects resets and logs bfis-session-reset events
 * - Error handling: Logs bfis-loop-error and retries on next tick
 * - Future: Invoking decider/command adapter per snapshot (post-MVP)
 *
 * The polling loop is the core orchestration mechanism that keeps BFIS
 * synchronized with the current battlefield state from Olympus.
 *
 * Per spec: Polling intervals are configurable (defaults: units/weapons 2000ms,
 * logs 1000ms, mission 5000ms). The loop uses the fastest interval (logs: 1000ms)
 * to ensure timely updates while respecting endpoint-specific intervals.
 *
 * Per spec-002: Uses readContextOnce() to get full context snapshots including
 * airbases, bullseyes, spots, drawings, logs, and weapons summary.
 *
 * @see SnapshotReader
 * @see BfisConfig.polling
 */
import { v4 as uuidv4 } from "uuid";
/**
 * Polling loop state and control.
 *
 * Manages the polling interval timer and provides start/stop control.
 */
export class PollingLoop {
    config;
    logger;
    snapshotReader;
    orchestrator;
    intervalId = null;
    isRunning = false;
    lastSessionHash = null;
    previousSnapshot = null;
    lastDecisionCycleTime = 0; // Timestamp of last decision cycle
    /**
     * Create a new polling loop with the given dependencies.
     *
     * @param config - BFIS configuration containing polling intervals
     * @param logger - Structured logger for loop events
     * @param snapshotReader - SnapshotReader instance to poll
     * @param orchestrator - Optional Orchestrator for multi-agent decision cycles
     */
    constructor(config, logger, snapshotReader, orchestrator) {
        this.config = config;
        this.logger = logger;
        this.snapshotReader = snapshotReader;
        this.orchestrator = orchestrator || null;
    }
    /**
     * Start the polling loop.
     *
     * Begins calling `snapshotReader.readContextOnce()` at the configured polling interval.
     * Uses the fastest interval from config (typically logs: 1000ms) to ensure
     * timely updates. The loop continues until `stop()` is called.
     *
     * Logs `bfis-loop-started` event on startup.
     *
     * @throws Error if loop is already running
     */
    start() {
        if (this.isRunning) {
            throw new Error("Polling loop is already running");
        }
        this.isRunning = true;
        // Use the fastest polling interval (typically logs: 1000ms)
        // This ensures timely updates while respecting endpoint-specific intervals
        // The SnapshotReader will handle endpoint-specific timing internally
        const pollIntervalMs = Math.min(this.config.polling.unitsMs, this.config.polling.weaponsMs, this.config.polling.logsMs, this.config.polling.missionMs);
        this.logger.info("bfis-loop-started", {
            pollIntervalMs,
            unitsMs: this.config.polling.unitsMs,
            weaponsMs: this.config.polling.weaponsMs,
            logsMs: this.config.polling.logsMs,
            missionMs: this.config.polling.missionMs,
        });
        // Start polling immediately, then continue at interval
        void this.pollOnce();
        this.intervalId = setInterval(() => {
            void this.pollOnce();
        }, pollIntervalMs);
    }
    /**
     * Stop the polling loop.
     *
     * Stops calling `readContextOnce()` and clears the interval timer.
     * Logs `bfis-loop-stopped` event on shutdown.
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.logger.info("bfis-loop-stopped");
    }
    /**
     * Perform a single poll cycle.
     *
     * Calls `snapshotReader.readContextOnce()` and handles:
     * - Session hash changes: Detects resets and logs bfis-session-reset
     * - Errors: Logs bfis-loop-error and continues (retries on next tick)
     * - Success: Updates lastSessionHash for change detection
     * - Orchestrator: Runs full decision cycle if orchestrator is configured
     *
     * @private
     */
    async pollOnce() {
        try {
            const snapshot = await this.snapshotReader.readContextOnce();
            // Check for session hash change (mission reset)
            // Use snapshot.base.sessionHash since BfisContextSnapshot wraps OlympusSnapshot in base
            if (this.lastSessionHash !== null && snapshot.base.sessionHash !== this.lastSessionHash) {
                this.logger.info("bfis-session-reset", {
                    previousSessionHash: this.lastSessionHash,
                    newSessionHash: snapshot.base.sessionHash,
                    snapshotId: snapshot.base.snapshotId,
                });
                // Clear previous snapshot cache on session change
                this.previousSnapshot = null;
            }
            this.lastSessionHash = snapshot.base.sessionHash;
            // Run orchestrator cycle if configured AND enabled via triggerOrchestrator flag
            // Per Spec-005: Default to human-in-the-loop mode (triggerOrchestrator=false)
            // to prevent autonomous "action-happy" behavior
            if (this.orchestrator && this.config.polling.triggerOrchestrator) {
                // Skip decision cycles if there are no units in the battlefield
                const totalUnits = snapshot.base.units.length;
                if (totalUnits === 0) {
                    this.logger.debug("bfis-cycle-skipped-empty", {
                        snapshotId: snapshot.base.snapshotId,
                        reason: "No units in battlefield",
                        unitCount: 0,
                    });
                    // Still update previous snapshot for change detection, but skip decision cycle
                    this.previousSnapshot = snapshot;
                    return;
                }
                const now = Date.now();
                const timeSinceLastCycle = now - this.lastDecisionCycleTime;
                const minInterval = this.config.polling.decisionCycleIntervalMs;
                // Throttle decision cycles to prevent hammering the LLM
                if (timeSinceLastCycle < minInterval) {
                    const remainingMs = minInterval - timeSinceLastCycle;
                    this.logger.debug("bfis-cycle-throttled", {
                        snapshotId: snapshot.base.snapshotId,
                        timeSinceLastCycle,
                        minInterval,
                        remainingMs,
                        skipped: true,
                    });
                    // Still update previous snapshot for change detection, but skip decision cycle
                    this.previousSnapshot = snapshot;
                    return;
                }
                // Run decision cycle
                this.lastDecisionCycleTime = now;
                const initialState = {
                    currentSnapshot: snapshot,
                    previousSnapshot: this.previousSnapshot,
                    intelOutput: null,
                    commanderInput: null,
                    decision: null,
                    writerInput: null,
                    commandResults: null,
                    error: null,
                    cycleId: uuidv4(),
                    cycleStartTime: new Date().toISOString(),
                    cycleEndTime: null,
                };
                const finalState = await this.orchestrator.runCycle(initialState);
                // Update previous snapshot for next cycle
                this.previousSnapshot = snapshot;
                // Log cycle results
                if (finalState.error) {
                    this.logger.warn("bfis-cycle-error", {
                        cycleId: finalState.cycleId,
                        agent: finalState.error.agent,
                        message: finalState.error.message,
                        recoverable: finalState.error.recoverable,
                    });
                }
                else {
                    this.logger.info("bfis-cycle-success", {
                        cycleId: finalState.cycleId,
                        decisionId: finalState.decision?.decisionId,
                        commandCount: finalState.commandResults?.length || 0,
                    });
                }
            }
            else {
                // No orchestrator or autonomous mode disabled - just log snapshot received
                // This is the default behavior per Spec-005 (human-in-the-loop)
                this.logger.debug("bfis-snapshot-received", {
                    snapshotId: snapshot.base.snapshotId,
                    unitCount: snapshot.base.units.length,
                    autonomousModeEnabled: this.config.polling.triggerOrchestrator,
                });
                // Still update previous snapshot for Intel tool queries
                this.previousSnapshot = snapshot;
            }
        }
        catch (err) {
            // Log error but continue polling (retry on next tick)
            // This ensures the loop doesn't stop on transient errors
            this.logger.error("bfis-loop-error", {
                message: err instanceof Error ? err.message : String(err),
                errorType: err instanceof Error ? err.constructor.name : typeof err,
                // Include stack trace for debugging
                stack: err instanceof Error ? err.stack : undefined,
            });
        }
    }
    /**
     * Check if the polling loop is currently running.
     *
     * @returns True if loop is running, false otherwise
     */
    isActive() {
        return this.isRunning;
    }
}
