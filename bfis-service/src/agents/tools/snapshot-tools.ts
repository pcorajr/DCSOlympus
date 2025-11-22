/**
 * Snapshot tools for Intel agent.
 *
 * Provides LangChain tools for fetching and summarizing battlefield snapshots.
 * These tools are used by the Intel agent to observe battlefield state.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { BfisContextSnapshot } from "../../context/types.js";
import type { TacticalSummary } from "../types.js";
import pkg from "lodash";
const { countBy } = pkg;
import type { OlympusCoalition } from "../../../../shared-schemas/index.js";

/**
 * Tool: Generate tactical summary from snapshot.
 *
 * Processes BfisContextSnapshot and generates TacticalSummary with unit counts,
 * key positions, and threat assessments.
 *
 * @param snapshot - Battlefield snapshot to summarize
 * @returns Tactical summary
 */
export const getSnapshotSummaryTool = tool(
  async ({ snapshot }: { snapshot: BfisContextSnapshot }): Promise<TacticalSummary> => {
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
    const coalitionCounts = countBy(snapshot.base.units, (u) => u.coalition);
    const threats: Array<{
      coalition: OlympusCoalition;
      description: string;
      severity: "low" | "medium" | "high";
    }> = [];

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

    return {
      unitCounts,
      categoryCounts,
      keyPositions,
      threats,
      snapshotTime: snapshot.base.time,
      snapshotId: snapshot.base.snapshotId,
    };
  },
  {
    name: "get_snapshot_summary",
    description:
      "Generates a tactical summary from a battlefield snapshot, including unit counts, key positions, and threat assessment.",
    schema: z.object({
      snapshot: z.any(), // BfisContextSnapshot type
    }),
  }
);
