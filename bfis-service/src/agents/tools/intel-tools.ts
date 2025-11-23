/**
 * Intel agent tools for LangChain integration.
 *
 * Provides LLM-callable tools for querying battlefield intelligence:
 * - get_battlefield_summary: Fetch current battlefield state
 * - get_unit_info: Query specific units by coalition, category, or zone
 * - get_recent_changes: Detect what changed since last check
 *
 * Per Spec-005 Section 4: Convert Intel agent to tool for LLM access.
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/specs/005-bfis-chat-interface.md | Spec-005}
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { IntelAgent } from "../intel-agent.js";
import type { BfisContextSnapshot } from "../../context/types.js";

interface IntelToolContext {
  snapshot: BfisContextSnapshot;
  sessionId: string;
  previousSnapshots: Map<string, BfisContextSnapshot>;
}

/**
 * Create Intel tools for LangChain LLM integration.
 *
 * @param intelAgent - Intel agent instance
 * @param snapshotReader - Snapshot reader instance
 * @param sessionHash - Current session hash for change detection
 * @returns Array of LangChain tools
 */
export function createIntelTools(
  intelAgent: IntelAgent,
  context: IntelToolContext
): any[] {
  // Cache reference for change detection (shared per session)
  const previousSnapshots = context.previousSnapshots;

  /**
   * Tool: Get current battlefield summary
   *
   * Fetches current battlefield state including unit counts, positions,
   * threats, and key locations. Use this when the human asks about
   * current situation.
   */
  const getCurrentSummaryTool = tool(
    async () => {
      try {
        const summary = await intelAgent.buildSummary(context.snapshot);
        return summary;
      } catch (error) {
        return { error: `Error fetching battlefield summary: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    {
      name: "get_battlefield_summary",
      description: "Fetches current battlefield state including unit counts, positions, threats, and key locations. Use this when the human asks about current situation or 'what's happening'.",
      schema: z.object({}),
    }
  );

  /**
   * Tool: Get specific unit information
   *
   * Queries specific units by coalition, category, or zone.
   * Use when human asks about specific forces.
   */
  const getUnitInfoTool = tool(
    async (params: { coalition?: string; category?: string; zone?: string }) => {
      try {
        const snapshot = context.snapshot;
        const { coalition, category, zone } = params;
        
        let filteredUnits = snapshot.base.units;

        // Filter by coalition
        if (coalition) {
          filteredUnits = filteredUnits.filter(u => 
            u.coalition?.toUpperCase() === coalition?.toUpperCase()
          );
        }

        // Filter by category
        if (category) {
          filteredUnits = filteredUnits.filter(u => 
            u.category?.toUpperCase() === category?.toUpperCase()
          );
        }

        // Filter by zone (simple name matching for MVP)
        if (zone) {
          filteredUnits = filteredUnits.filter(u => 
            u.name?.toLowerCase().includes(zone?.toLowerCase() || "")
          );
        }

        const result = {
          totalCount: filteredUnits.length,
          filters: params,
          units: filteredUnits.slice(0, 50).map(u => ({
            unitId: u.unitId,
            name: u.name || "Unknown",
            coalition: u.coalition || "UNKNOWN",
            category: u.category || "UNKNOWN",
            position: u.position,
            type: u.unitType || u.name || "UNKNOWN", // OlympusUnit has unitType, not type
          })),
          truncated: filteredUnits.length > 50,
          countsByType: filteredUnits.reduce((acc: Record<string, number>, u) => {
            const t = u.unitType || u.name || "UNKNOWN";
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          }, {}),
        };

        return result;
      } catch (error) {
        return { error: `Error fetching unit info: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    {
      name: "get_unit_info",
      description: "Queries specific units by coalition (BLUE/RED/NEUTRAL), category (AIRPLANE, HELICOPTER, SHIP, SAM, etc), or zone name. Use when human asks about specific forces like 'show me RED aircraft' or 'what BLUE ships are there'.",
      schema: z.object({
        coalition: z.enum(["BLUE", "RED", "NEUTRAL", "UNKNOWN"]).optional().describe("Filter by coalition"),
        category: z.string().optional().describe("Filter by unit category (AIRPLANE, HELICOPTER, SHIP, SAM, etc)"),
        zone: z.string().optional().describe("Filter by zone name (partial match)"),
      }),
    }
  );

  /**
   * Tool: Get aircraft breakdown by type.
   */
  const getAircraftBreakdownTool = tool(
    async () => {
      try {
        const snapshot = context.snapshot;
        const aircraft = snapshot.base.units.filter(u => (u.category || "").toUpperCase() === "AIRPLANE");
        const byType = aircraft.reduce((acc: Record<string, number>, u) => {
          const t = u.unitType || u.name || "UNKNOWN";
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        }, {});
        return {
          totalAircraft: aircraft.length,
          byType,
          sample: aircraft.slice(0, 50).map(u => ({
            unitId: u.unitId,
            name: u.name || "Unknown",
            type: u.unitType || u.name || "UNKNOWN",
            coalition: u.coalition || "UNKNOWN",
            position: u.position,
          })),
        };
      } catch (error) {
        return { error: `Error getting aircraft breakdown: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    {
      name: "get_aircraft_breakdown",
      description: "Provides aircraft counts by type (e.g., IL-76, B-1B) plus samples. Use for questions about specific aircraft types or totals.",
      schema: z.object({}),
    }
  );

  /**
   * Tool: Get recent changes
   *
   * Detects what changed since last check (new units, destroyed units, movements).
   * Use when human asks 'what changed' or 'what's new'.
   */
  const getRecentChangesTool = tool(
    async () => {
      try {
        const prev = previousSnapshots.get(context.sessionId);

        if (!prev) {
          previousSnapshots.set(context.sessionId, context.snapshot);
          return {
            message: "No previous snapshot available - this is the first check",
            currentUnitCount: context.snapshot.base.units.length,
          };
        }

        const changes = await intelAgent.detectChanges(context.snapshot, prev);
        previousSnapshots.set(context.sessionId, context.snapshot);
        return changes ?? { message: "No significant changes detected" };
      } catch (error) {
        return { error: `Error detecting changes: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    {
      name: "get_recent_changes",
      description: "Detects what changed since last check including new units, destroyed units, and unit movements. Use when human asks 'what changed', 'what's new', or 'any updates'.",
      schema: z.object({}),
    }
  );

  return [getCurrentSummaryTool, getUnitInfoTool, getAircraftBreakdownTool, getRecentChangesTool];
}
