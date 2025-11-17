/**
 * Polling loop orchestrator for BFIS snapshot ingestion.
 * 
 * This module manages the continuous polling of Olympus endpoints by calling
 * `SnapshotReader.readOnce()` at configured intervals. It handles:
 * - Timing: Calls readOnce() at intervals from BfisConfig.polling
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
 * @see SnapshotReader
 * @see BfisConfig.polling
 */

import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { SnapshotReader } from "../snapshot/snapshot-reader.js";
import type { OlympusSnapshot } from "../../../shared-schemas/index.js";

/**
 * Polling loop state and control.
 * 
 * Manages the polling interval timer and provides start/stop control.
 */
export class PollingLoop {
  private readonly config: BfisConfig;
  private readonly logger: StructuredLogger;
  private readonly snapshotReader: SnapshotReader;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastSessionHash: string | null = null;

  /**
   * Create a new polling loop with the given dependencies.
   * 
   * @param config - BFIS configuration containing polling intervals
   * @param logger - Structured logger for loop events
   * @param snapshotReader - SnapshotReader instance to poll
   */
  constructor(config: BfisConfig, logger: StructuredLogger, snapshotReader: SnapshotReader) {
    this.config = config;
    this.logger = logger;
    this.snapshotReader = snapshotReader;
  }

  /**
   * Start the polling loop.
   * 
   * Begins calling `snapshotReader.readOnce()` at the configured polling interval.
   * Uses the fastest interval from config (typically logs: 1000ms) to ensure
   * timely updates. The loop continues until `stop()` is called.
   * 
   * Logs `bfis-loop-started` event on startup.
   * 
   * @throws Error if loop is already running
   */
  start(): void {
    if (this.isRunning) {
      throw new Error("Polling loop is already running");
    }

    this.isRunning = true;
    
    // Use the fastest polling interval (typically logs: 1000ms)
    // This ensures timely updates while respecting endpoint-specific intervals
    // The SnapshotReader will handle endpoint-specific timing internally
    const pollIntervalMs = Math.min(
      this.config.polling.unitsMs,
      this.config.polling.weaponsMs,
      this.config.polling.logsMs,
      this.config.polling.missionMs
    );

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
   * Stops calling `readOnce()` and clears the interval timer.
   * Logs `bfis-loop-stopped` event on shutdown.
   */
  stop(): void {
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
   * Calls `snapshotReader.readOnce()` and handles:
   * - Session hash changes: Detects resets and logs bfis-session-reset
   * - Errors: Logs bfis-loop-error and continues (retries on next tick)
   * - Success: Updates lastSessionHash for change detection
   * 
   * Future: After successful snapshot, invoke decider/command adapter (post-MVP).
   * 
   * @private
   */
  private async pollOnce(): Promise<void> {
    try {
      const snapshot: OlympusSnapshot = await this.snapshotReader.readOnce();

      // Check for session hash change (mission reset)
      if (this.lastSessionHash !== null && snapshot.sessionHash !== this.lastSessionHash) {
        this.logger.info("bfis-session-reset", {
          previousSessionHash: this.lastSessionHash,
          newSessionHash: snapshot.sessionHash,
          snapshotId: snapshot.snapshotId,
        });
      }

      this.lastSessionHash = snapshot.sessionHash;

      // TODO (post-MVP): Invoke decider/command adapter here
      // const decision = await this.decider.decide(snapshot);
      // await this.commandAdapter.execute(decision);
      // await this.ndjsonLogger.log(decision);

    } catch (err) {
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
  isActive(): boolean {
    return this.isRunning;
  }
}

