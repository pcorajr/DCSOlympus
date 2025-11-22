/**
 * Rules-based decision-making fallback.
 *
 * Produces conservative defensive actions when LLM decision-making fails.
 * Per spec: Protects key assets, spawns defensive units, never attacks before hostilities.
 */

import type { BfisDecision, BfisAction } from "../../../shared-schemas/index.js";
import type { TacticalSummary, MissionContext } from "./types.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Rules-based decision-making fallback.
 *
 * Produces conservative defensive actions when LLM decision-making fails.
 * Per spec: Protects key assets, spawns defensive units, never attacks before hostilities.
 *
 * This implementation generates simple defensive actions to ensure the rules fallback
 * produces tangible actions rather than empty decisions (FR-009, FR-003).
 *
 * @param intelSummary - Tactical summary from Intel agent
 * @param missionContext - Mission metadata including hostility status
 * @returns Conservative defensive decision
 */
export function makeRulesBasedDecision(
  intelSummary: TacticalSummary,
  missionContext: MissionContext
): BfisDecision {
  const actions: BfisAction[] = [];
  const reasoningNotes: string[] = [];

  // Rule 1: Protect BLUE key assets (airbases) when threats detected
  const blueAirbases = intelSummary.keyPositions.filter(
    (p) => p.type === "airbase" && p.coalition === "BLUE"
  );
  const highThreats = intelSummary.threats.filter((t) => t.severity === "high");
  const mediumThreats = intelSummary.threats.filter((t) => t.severity === "medium");
  
  if (blueAirbases.length > 0 && (highThreats.length > 0 || mediumThreats.length > 0)) {
    reasoningNotes.push(`Protecting ${blueAirbases.length} BLUE airbase(s) from ${highThreats.length} high and ${mediumThreats.length} medium threats`);
    
    // Spawn defensive CAP (Combat Air Patrol) at first BLUE airbase
    // Conservative approach: spawn 2 F-16C fighters at 10,000m altitude
    const airbase = blueAirbases[0];
    actions.push({
      type: "SPAWN",
      target: {
        coordinateRef: {
          lat: airbase.position.lat,
          lon: airbase.position.lon,
          altMeters: 10000,
        },
      },
      params: {
        unitType: "F-16C_50",
        count: 2,
        coalition: "BLUE",
        airbaseName: airbase.label || undefined,
      },
    });
    reasoningNotes.push("Spawned defensive CAP (2x F-16C) at BLUE airbase");
  }

  // Rule 2: If BLUE has very few units and no threats, spawn initial defensive forces
  const blueUnitCount = intelSummary.unitCounts.BLUE || 0;
  const totalThreats = intelSummary.threats.length;
  
  if (blueUnitCount < 5 && totalThreats === 0 && blueAirbases.length > 0) {
    reasoningNotes.push(`Low BLUE unit count (${blueUnitCount}), spawning initial defensive forces`);
    
    // Spawn initial CAP at first BLUE airbase
    const airbase = blueAirbases[0];
    actions.push({
      type: "SPAWN",
      target: {
        coordinateRef: {
          lat: airbase.position.lat,
          lon: airbase.position.lon,
          altMeters: 8000,
        },
      },
      params: {
        unitType: "F-16C_50",
        count: 2,
        coalition: "BLUE",
        airbaseName: airbase.label || undefined,
      },
    });
    reasoningNotes.push("Spawned initial CAP (2x F-16C) for low unit count scenario");
  }

  // Rule 3: Never attack before hostilities begin (safety constraint)
  if (!missionContext.hostilitiesStarted) {
    reasoningNotes.push("Hostilities not started - only defensive spawns allowed");
    // Filter out any ATTACK actions (defensive measure, though rules shouldn't generate them)
    const attackActions = actions.filter(a => a.type === "ATTACK");
    if (attackActions.length > 0) {
      actions.splice(0, actions.length, ...actions.filter(a => a.type !== "ATTACK"));
      reasoningNotes.push(`Removed ${attackActions.length} ATTACK action(s) due to hostilities constraint`);
    }
  }

  // Rule 4: If still no actions, provide reasoning but don't force empty actions
  if (actions.length === 0) {
    reasoningNotes.push("Rules-based fallback: No defensive actions needed (no threats detected or no BLUE airbases available)");
  }

  return {
    decisionId: uuidv4(),
    actions,
    reasoningNotes: reasoningNotes.join("; "),
    timestamp: new Date().toISOString(),
    missionId: missionContext.missionId,
    serverId: missionContext.serverId,
    snapshotId: intelSummary.snapshotId,
  };
}

