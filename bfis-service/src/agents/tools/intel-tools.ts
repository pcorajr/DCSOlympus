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
import type { SnapshotReader } from "../../snapshot/snapshot-reader.js";

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
  snapshotReader: SnapshotReader,
  sessionHash: string
): any[] {
  // Cache for previous snapshot (for change detection)
  let previousSnapshot: any = null;

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
        const snapshot = await snapshotReader.readContextOnce();
        
        // Build summary manually since generateSummary is private
        // TODO: Make IntelAgent.generateSummary public or add public method
        const summary = {
          snapshotId: snapshot.base.snapshotId,
          snapshotTime: snapshot.base.time || new Date().toISOString(),
          unitCounts: {
            BLUE: snapshot.base.units.filter(u => u.coalition === "BLUE").length,
            RED: snapshot.base.units.filter(u => u.coalition === "RED").length,
            NEUTRAL: snapshot.base.units.filter(u => u.coalition === "NEUTRAL").length,
            UNKNOWN: snapshot.base.units.filter(u => !u.coalition || u.coalition === "UNKNOWN").length,
          },
          categoryCounts: snapshot.base.units.reduce((acc, unit) => {
            const category = unit.category || "UNKNOWN";
            acc[category] = (acc[category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          keyPositions: snapshot.base.units
            .filter(u => u.coalition === "BLUE" && (u.category === "AIRBASE" || u.category === "SHIP"))
            .slice(0, 10)
            .map(u => ({
              unitId: u.unitId,
              name: u.name || "Unknown",
              position: u.position,
              category: u.category || "UNKNOWN",
            })),
          threats: snapshot.base.units
            .filter(u => u.coalition === "RED" && (u.category === "AIRPLANE" || u.category === "SAM"))
            .slice(0, 10)
            .map(u => ({
              unitId: u.unitId,
              name: u.name || "Unknown",
              position: u.position,
              category: u.category || "UNKNOWN",
              threat: u.category === "SAM" ? "high" : "medium",
            })),
        };

        return JSON.stringify(summary, null, 2);
      } catch (error) {
        return `Error fetching battlefield summary: ${error instanceof Error ? error.message : String(error)}`;
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
        const snapshot = await snapshotReader.readContextOnce();
        
        let filteredUnits = snapshot.base.units;

        // Filter by coalition
        if (params.coalition) {
          filteredUnits = filteredUnits.filter(u => 
            u.coalition?.toUpperCase() === params.coalition?.toUpperCase()
          );
        }

        // Filter by category
        if (params.category) {
          filteredUnits = filteredUnits.filter(u => 
            u.category?.toUpperCase() === params.category?.toUpperCase()
          );
        }

        // Filter by zone (simple name matching for MVP)
        if (params.zone) {
          filteredUnits = filteredUnits.filter(u => 
            u.name?.toLowerCase().includes(params.zone?.toLowerCase() || "")
          );
        }

        const result = {
          totalCount: filteredUnits.length,
          filters: params,
          units: filteredUnits.slice(0, 20).map(u => ({
            unitId: u.unitId,
            name: u.name || "Unknown",
            coalition: u.coalition || "UNKNOWN",
            category: u.category || "UNKNOWN",
            position: u.position,
          })),
          truncated: filteredUnits.length > 20,
        };

        return JSON.stringify(result, null, 2);
      } catch (error) {
        return `Error fetching unit info: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "get_unit_info",
      description: "Queries specific units by coalition (BLUE/RED/NEUTRAL), category (AIRPLANE/HELICOPTER/SHIP/SAM/etc), or zone name. Use when human asks about specific forces like 'show me RED aircraft' or 'what BLUE ships are there'.",
      schema: z.object({
        coalition: z.enum(["BLUE", "RED", "NEUTRAL", "UNKNOWN"]).optional().describe("Filter by coalition"),
        category: z.string().optional().describe("Filter by unit category (AIRPLANE, HELICOPTER, SHIP, SAM, etc)"),
        zone: z.string().optional().describe("Filter by zone name (partial match)"),
      }),
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
        const currentSnapshot = await snapshotReader.readContextOnce();

        if (!previousSnapshot) {
          previousSnapshot = currentSnapshot;
          return JSON.stringify({
            message: "No previous snapshot available - this is the first check",
            currentUnitCount: currentSnapshot.base.units.length,
          }, null, 2);
        }

        // Detect changes manually since detectChanges is private
        // Simple change detection: compare unit counts
        const prevUnits = previousSnapshot.base.units || [];
        const currUnits = currentSnapshot.base.units || [];
        
        const prevUnitIds = new Set(prevUnits.map((u: any) => u.unitId));
        const currUnitIds = new Set(currUnits.map((u: any) => u.unitId));
        
        const newUnits = currUnits.filter((u: any) => !prevUnitIds.has(u.unitId)).slice(0, 10);
        const destroyedUnits = prevUnits.filter((u: any) => !currUnitIds.has(u.unitId)).slice(0, 10);

        // Update cache
        previousSnapshot = currentSnapshot;

        const result = {
          newUnits: newUnits.map((u: any) => ({
            unitId: u.unitId,
            name: u.name || "Unknown",
            coalition: u.coalition || "UNKNOWN",
            category: u.category || "UNKNOWN",
          })),
          destroyedUnits: destroyedUnits.map((u: any) => ({
            unitId: u.unitId,
            name: u.name || "Unknown",
            coalition: u.coalition || "UNKNOWN",
            category: u.category || "UNKNOWN",
          })),
          movedUnits: [], // Simplified for MVP
          hostilityChanged: false,
          totalNew: newUnits.length,
          totalDestroyed: destroyedUnits.length,
          totalMoved: 0,
        };

        return JSON.stringify(result, null, 2);
      } catch (error) {
        return `Error detecting changes: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "get_recent_changes",
      description: "Detects what changed since last check including new units, destroyed units, and unit movements. Use when human asks 'what changed', 'what's new', or 'any updates'.",
      schema: z.object({}),
    }
  );

  return [getCurrentSummaryTool, getUnitInfoTool, getRecentChangesTool];
}
