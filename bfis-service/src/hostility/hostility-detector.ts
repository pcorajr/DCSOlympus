/**
 * Hostility Detector - Detects when hostilities have started in a mission session.
 * 
 * This module provides minimal hostility awareness by detecting when the first
 * weapon is fired. It maintains in-memory state per mission session and integrates
 * with SnapshotReader to provide hostility awareness in context snapshots.
 * 
 * Detection method:
 * - Examines weapons data from the weapons cache
 * - If any weapon exists in cache (regardless of alive status), hostilities are considered started
 * - Maintains a one-time flag that remains true for the entire mission session
 * - Resets state when mission session hash changes
 * 
 * @see FR-001, FR-002, FR-003, FR-004, FR-005
 */

import type { StructuredLogger } from "../logger/structured-logger.js";
import type { DecodedWeapon } from "../snapshot/weapon-decoder.js";
import type { HostilityAwareness } from "../context/types.js";

/**
 * Detects when hostilities have started in a mission session.
 * 
 * Examines weapons data from the snapshot to determine if any weapons
 * have been fired. Maintains in-memory state per mission session.
 * 
 * @see FR-001, FR-002, FR-003, FR-004, FR-005
 */
export class HostilityDetector {
  private hostilitiesStarted: boolean = false;
  private hostilitiesStartTime?: number;
  private lastSessionHash: string | null = null;
  private readonly logger?: StructuredLogger;

  /**
   * Create a new HostilityDetector instance.
   * 
   * @param logger - Optional structured logger for event logging
   */
  constructor(logger?: StructuredLogger) {
    this.logger = logger;
  }

  /**
   * Update hostility awareness based on current weapons cache and session hash.
   * 
   * @param weaponCache - Map of weaponId to DecodedWeapon from SnapshotReader
   * @param sessionHash - Current session hash from mission data
   * @returns HostilityAwareness object with current state
   */
  detect(
    weaponCache: Map<number, DecodedWeapon>,
    sessionHash: string
  ): HostilityAwareness {
    // Reset on session hash change
    if (this.lastSessionHash !== null && this.lastSessionHash !== sessionHash) {
      this.hostilitiesStarted = false;
      this.hostilitiesStartTime = undefined;
      
      this.logger?.info("bfis-hostilities-reset", {
        previousSessionHash: this.lastSessionHash,
        newSessionHash: sessionHash,
      });
    }
    this.lastSessionHash = sessionHash;

    // Detect if any weapon exists in cache (indicates weapon was fired)
    if (!this.hostilitiesStarted && weaponCache.size > 0) {
      // Find earliest weapon updateTime
      let earliestTime = Number.MAX_SAFE_INTEGER;
      for (const weapon of weaponCache.values()) {
        if (weapon.updateTime < earliestTime) {
          earliestTime = weapon.updateTime;
        }
      }
      
      this.hostilitiesStarted = true;
      this.hostilitiesStartTime = earliestTime;

      this.logger?.info("bfis-hostilities-started", {
        sessionHash,
        hostilitiesStartTime: earliestTime,
        weaponCount: weaponCache.size,
      });
    } else if (this.hostilitiesStarted) {
      // Debug log for status when already started
      this.logger?.debug("bfis-hostilities-status", {
        sessionHash,
        hostilitiesStarted: true,
        hostilitiesStartTime: this.hostilitiesStartTime,
        weaponCount: weaponCache.size,
      });
    }

    return {
      hostilitiesStarted: this.hostilitiesStarted,
      hostilitiesStartTime: this.hostilitiesStartTime,
      sessionHash,
    };
  }
}

