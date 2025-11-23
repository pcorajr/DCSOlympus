/**
 * Intel agent: Observes and summarizes battlefield state.
 *
 * Generates high-level tactical summaries from battlefield snapshots,
 * enabling efficient decision-making without processing every detail.
 *
 * Per spec-004: Intel agent = Snapshot Summarizer + Change Detector
 * - Consumes BfisContextSnapshot from decoders
 * - Generates tactical summaries (unit counts, positions, threats)
 * - Detects changes between snapshots
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/architecture/spec-004.md | spec-004.md}
 */

import type { BfisContextSnapshot } from "../context/types.js";
import type { TacticalSummary, IntelAgentOutput, SnapshotDelta } from "./types.js";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import pkg from "lodash";
const { countBy } = pkg;
// @ts-ignore - Turf.js types issue with package.json exports
import * as turf from "@turf/turf";
import type { OlympusCoalition } from "../../../shared-schemas/index.js";

/**
 * Intel agent: Observes and summarizes battlefield state.
 *
 * Generates high-level tactical summaries from battlefield snapshots,
 * enabling efficient decision-making without processing every detail.
 */
export class IntelAgent {
  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Process battlefield snapshot and generate tactical summary.
   *
   * @param currentSnapshot - Current battlefield state
   * @param previousSnapshot - Previous snapshot for change detection (null if first)
   * @returns Intel agent output with summary and optional changes
   */
  async process(
    currentSnapshot: BfisContextSnapshot,
    previousSnapshot: BfisContextSnapshot | null
  ): Promise<IntelAgentOutput> {
    const startTime = Date.now();
    const snapshotId = currentSnapshot.base.snapshotId;

    this.logger.debug("bfis-intel-process-start", {
      snapshotId,
      unitCount: currentSnapshot.base.units.length,
      hasPreviousSnapshot: previousSnapshot !== null,
      previousSnapshotId: previousSnapshot?.base.snapshotId || null,
      timestamp: new Date().toISOString(),
    });

    try {
      // Detect session hash change (mission reset)
      if (previousSnapshot && previousSnapshot.base.sessionHash !== currentSnapshot.base.sessionHash) {
        this.logger.info("bfis-intel-session-reset", {
          oldSessionHash: previousSnapshot.base.sessionHash,
          newSessionHash: currentSnapshot.base.sessionHash,
          snapshotId,
        });
        // Treat as first observation (no previous snapshot for change detection)
        previousSnapshot = null;
      }

      // Generate tactical summary
      const summaryStartTime = Date.now();
      const summary = await this.buildSummary(currentSnapshot);
      const summaryDuration = Date.now() - summaryStartTime;
      
      this.logger.debug("bfis-intel-summary-complete", {
        snapshotId,
        durationMs: summaryDuration,
        totalUnits: Object.values(summary.unitCounts).reduce((a, b) => a + b, 0),
        threatCount: summary.threats.length,
      });

      // Log summary generation
      this.logger.info("bfis-intel-summary-generated", {
        snapshotId: summary.snapshotId,
        summary: {
          unitCounts: summary.unitCounts,
          categoryCounts: summary.categoryCounts,
          threatCount: summary.threats.length,
        },
        generationTimeMs: Date.now() - startTime,
      });

      // Detect changes if previous snapshot available
      let changes: SnapshotDelta | undefined = undefined;
      let changesDuration = 0;
      if (previousSnapshot) {
        const changesStartTime = Date.now();
        const detectedChanges = await this.detectChanges(currentSnapshot, previousSnapshot);
        changesDuration = Date.now() - changesStartTime;
        changes = detectedChanges || undefined; // Convert null to undefined
        
        if (changes) {
          this.logger.debug("bfis-intel-changes-complete", {
            snapshotId,
            durationMs: changesDuration,
            newUnits: changes.newUnits.length,
            destroyedUnits: changes.destroyedUnits.length,
            movedUnits: changes.movedUnits.length,
            hostilityChanged: changes.hostilityChanged,
          });
        }
      } else {
        this.logger.debug("bfis-intel-changes-skipped", {
          snapshotId,
          reason: "No previous snapshot available",
        });
      }
      
      const totalDuration = Date.now() - startTime;
      this.logger.debug("bfis-intel-process-complete", {
        snapshotId,
        totalDurationMs: totalDuration,
        summaryDurationMs: summaryDuration,
        changesDurationMs: changesDuration,
        timestamp: new Date().toISOString(),
      });
      
      return {
        summary,
        changes: changes || undefined, // Convert null to undefined
        timestamp: new Date().toISOString(),
        rawSnapshot: currentSnapshot, // Optional, may be omitted to save tokens
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      this.logger.error("bfis-intel-snapshot-error", {
        error: errorMessage,
        errorType,
        snapshotId: currentSnapshot?.base.snapshotId || "unknown",
      });

      // For recoverable errors, return partial summary
      // For fatal errors, throw to propagate to orchestrator
      if (errorType === "NetworkError" || errorType === "TimeoutError") {
        // Recoverable - return empty summary
        return {
          summary: this.createEmptySummary(currentSnapshot),
          timestamp: new Date().toISOString(),
        };
      }

      throw error; // Fatal error
    }
  }

  /**
   * Generate tactical summary from snapshot.
   *
   * @param snapshot - Battlefield snapshot
   * @returns Tactical summary
   */
  async buildSummary(snapshot: BfisContextSnapshot): Promise<TacticalSummary> {
    // Count units by coalition
    const unitCounts: Record<OlympusCoalition, number> = {
      BLUE: 0,
      RED: 0,
      NEUTRAL: 0,
      UNKNOWN: 0,
    };

    snapshot.base.units.forEach((unit) => {
      unitCounts[unit.coalition] = (unitCounts[unit.coalition] || 0) + 1;
    });

    // Count units by category
    const categoryCounts = countBy(snapshot.base.units, (unit) => unit.category);

    // Extract key positions (airbases, bullseyes)
    const keyPositions = [
      ...snapshot.airbases
        .filter((ab) => ab.position) // Only include airbases with positions
        .map((ab) => ({
          type: "airbase" as const,
          coalition: ab.coalition,
          position: {
            lat: ab.position!.lat,
            lon: ab.position!.lon,
            altMeters: ab.position!.altMeters,
          },
          label: ab.name || ab.id,
        })),
      ...snapshot.bullseyes
        .filter((be) => be.position) // Only include bullseyes with positions
        .map((be) => ({
          type: "bullseye" as const,
          coalition: be.coalition,
          position: {
            lat: be.position!.lat,
            lon: be.position!.lon,
          },
          label: be.id,
        })),
    ];

    // Generate threat assessments (simplified for MVP)
    const threats = this.assessThreats(snapshot);

    return {
      unitCounts,
      categoryCounts,
      keyPositions,
      threats,
      snapshotTime: snapshot.base.time,
      snapshotId: snapshot.base.snapshotId,
    };
  }

  /**
   * Assess threats from snapshot.
   *
   * @param snapshot - Battlefield snapshot
   * @returns Array of threat assessments
   */
  private assessThreats(snapshot: BfisContextSnapshot): Array<{
    coalition: OlympusCoalition;
    description: string;
    severity: "low" | "medium" | "high";
  }> {
    const threats: Array<{ coalition: OlympusCoalition; description: string; severity: "low" | "medium" | "high" }> = [];

    // Count units by coalition to assess threat levels
    const coalitionCounts = countBy(snapshot.base.units, (u) => u.coalition);

    // High threat: RED has significantly more units than BLUE
    if ((coalitionCounts.RED || 0) > (coalitionCounts.BLUE || 0) * 1.5) {
      threats.push({
        coalition: "RED",
        description: `RED has ${coalitionCounts.RED || 0} units vs BLUE's ${coalitionCounts.BLUE || 0}`,
        severity: "high",
      });
    }

    // Medium threat: RED has more units
    if ((coalitionCounts.RED || 0) > (coalitionCounts.BLUE || 0)) {
      threats.push({
        coalition: "RED",
        description: `RED has ${coalitionCounts.RED || 0} units vs BLUE's ${coalitionCounts.BLUE || 0}`,
        severity: "medium",
      });
    }

    return threats;
  }

  /**
   * Detect changes between two snapshots.
   *
   * Identifies new units, destroyed units, units that moved significantly,
   * and changes in hostility status.
   *
   * @param current - Current snapshot
   * @param previous - Previous snapshot
   * @returns Snapshot delta or null if no changes detected
   */
  async detectChanges(
    current: BfisContextSnapshot,
    previous: BfisContextSnapshot
  ): Promise<SnapshotDelta | null> {
    const positionThreshold = this.config.agents?.intel.positionChangeThresholdMeters ?? 1000;

    // Build unit ID sets for efficient lookup
    const currentUnitIds = new Set(current.base.units.map((u) => u.unitId));
    const previousUnitIds = new Set(previous.base.units.map((u) => u.unitId));

    // Find new units (in current but not in previous)
    const newUnits = current.base.units
      .filter((u) => !previousUnitIds.has(u.unitId))
      .map((u) => ({
        unitId: u.unitId,
        coalition: u.coalition,
        category: u.category,
      }));

    // Find destroyed units (in previous but not in current)
    const destroyedUnits = previous.base.units
      .filter((u) => !currentUnitIds.has(u.unitId))
      .map((u) => ({
        unitId: u.unitId,
        coalition: u.coalition,
      }));

    // Find moved units (common IDs with position changes > threshold)
    const previousUnitsMap = new Map(previous.base.units.map((u) => [u.unitId, u]));
    const movedUnits = current.base.units
      .filter((u) => {
        const prevUnit = previousUnitsMap.get(u.unitId);
        if (!prevUnit) return false;

        // Calculate distance using Turf.js
        const distance =
          turf.distance(
            [prevUnit.position.lon, prevUnit.position.lat],
            [u.position.lon, u.position.lat],
            { units: "kilometers" }
          ) * 1000; // Convert to meters

        return distance > positionThreshold;
      })
      .map((u) => {
        const prevUnit = previousUnitsMap.get(u.unitId)!;
        return {
          unitId: u.unitId,
          oldPosition: { lat: prevUnit.position.lat, lon: prevUnit.position.lon },
          newPosition: { lat: u.position.lat, lon: u.position.lon },
        };
      });

    // Detect hostility status change
    const hostilityChanged =
      current.hostility.hostilitiesStarted !== previous.hostility.hostilitiesStarted;

    // Log changes if significant
    if (newUnits.length > 0 || destroyedUnits.length > 0 || movedUnits.length > 0 || hostilityChanged) {
      this.logger.info("bfis-intel-changes-detected", {
        snapshotId: current.base.snapshotId,
        previousSnapshotId: previous.base.snapshotId,
        changes: {
          newUnits: newUnits.length,
          destroyedUnits: destroyedUnits.length,
          movedUnits: movedUnits.length,
          hostilityChanged,
        },
      });
    }

    return {
      newUnits,
      destroyedUnits,
      movedUnits,
      hostilityChanged,
      previousSnapshotTime: previous.base.time,
      currentSnapshotTime: current.base.time,
    };
  }

  /**
   * Create empty summary for error recovery.
   *
   * @param snapshot - Snapshot to create empty summary for
   * @returns Empty tactical summary
   */
  private createEmptySummary(snapshot: BfisContextSnapshot): TacticalSummary {
    return {
      unitCounts: {
        BLUE: 0,
        RED: 0,
        NEUTRAL: 0,
        UNKNOWN: 0,
      },
      categoryCounts: {},
      keyPositions: [],
      threats: [],
      snapshotTime: snapshot.base.time,
      snapshotId: snapshot.base.snapshotId,
    };
  }
}
