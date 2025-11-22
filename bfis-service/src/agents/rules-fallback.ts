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

  // Rule 1: Protect BLUE key assets (airbases)
  const blueAirbases = intelSummary.keyPositions.filter(
    (p) => p.type === "airbase" && p.coalition === "BLUE"
  );
  if (blueAirbases.length > 0) {
    reasoningNotes.push(`Protecting ${blueAirbases.length} BLUE airbase(s)`);
    // Add defensive spawn actions near airbases if threats detected
    // For MVP, we log the intent but don't generate concrete spawn actions yet
    // This will be enhanced when Writer agent is implemented
  }

  // Rule 2: Spawn defensive units near high-severity threats
  const highThreats = intelSummary.threats.filter((t) => t.severity === "high");
  if (highThreats.length > 0 && missionContext.hostilitiesStarted) {
    reasoningNotes.push(`Addressing ${highThreats.length} high-severity threat(s)`);
    // Add defensive spawn actions
    // For MVP, we log the intent but don't generate concrete spawn actions yet
  }

  // Rule 3: Never attack before hostilities begin
  if (!missionContext.hostilitiesStarted) {
    reasoningNotes.push("Hostilities not started - no aggressive actions");
    // Only spawn/move actions, no attacks
  }

  // Rule 4: If no specific actions, produce empty decision with reasoning
  if (actions.length === 0) {
    reasoningNotes.push("Rules-based fallback: No specific actions required at this time");
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

