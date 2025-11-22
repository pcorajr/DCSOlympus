/**
 * Commander agent: Makes tactical decisions based on battlefield intelligence.
 *
 * Uses LLM to generate decisions with actions and reasoning, falls back to
 * rules-based decision-making on LLM failure.
 *
 * Per spec-004: Commander agent = Decision Maker
 * - Consumes Intel agent output (tactical summaries, changes)
 * - Generates high-level tactical decisions (BfisDecision)
 * - Falls back to rules-based logic when LLM unavailable
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/architecture/spec-004.md | spec-004.md}
 */

import type { CommanderAgentInput } from "./types.js";
import type { BfisDecision } from "../../../shared-schemas/index.js";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import { createLLMClient } from "../intent/llm-client.js";
import { makeRulesBasedDecision } from "./rules-fallback.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Commander agent: Makes tactical decisions based on battlefield intelligence.
 *
 * Uses LLM to generate decisions with actions and reasoning, falls back to
 * rules-based decision-making on LLM failure.
 */
export class CommanderAgent {
  private readonly llmClient: ReturnType<typeof createLLMClient>;
  private readonly enableRulesFallback: boolean;
  private readonly maxActionsPerDecision: number;

  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger
  ) {
    this.llmClient = createLLMClient(config);
    this.enableRulesFallback = config.agents?.commander.enableRulesFallback ?? true;
    this.maxActionsPerDecision = config.agents?.commander.maxActionsPerDecision ?? 10;
  }

  /**
   * Make tactical decision based on Intel summary and mission context.
   *
   * @param input - Commander agent input (Intel output + mission context)
   * @returns Tactical decision with actions and reasoning
   */
  async makeDecision(input: CommanderAgentInput): Promise<BfisDecision> {
    const startTime = Date.now();
    const snapshotId = input.intelSummary.snapshotId;

    this.logger.debug("bfis-commander-decision-start", {
      snapshotId,
      unitCount: Object.values(input.intelSummary.unitCounts).reduce((a, b) => a + b, 0),
      hasChanges: input.changes !== undefined,
      hasPreviousDecision: input.previousDecision !== null,
      timestamp: new Date().toISOString(),
    });

    try {
      // Check if LLM is available
      const llmCheckStartTime = Date.now();
      const llmAvailable = await this.llmClient.isAvailable();
      const llmCheckDuration = Date.now() - llmCheckStartTime;
      
      this.logger.debug("bfis-commander-llm-check", {
        snapshotId,
        available: llmAvailable,
        durationMs: llmCheckDuration,
      });

      if (!llmAvailable && this.enableRulesFallback) {
        this.logger.warn("bfis-commander-llm-unavailable", {
          message: "LLM unavailable, using rules-based fallback",
          snapshotId,
        });
        const rulesStartTime = Date.now();
        const decision = await this.makeRulesBasedDecision(input);
        const rulesDuration = Date.now() - rulesStartTime;
        
        this.logger.debug("bfis-commander-rules-decision-complete", {
          snapshotId,
          decisionId: decision.decisionId,
          actionCount: decision.actions.length,
          durationMs: rulesDuration,
        });
        
        return decision;
      }

      // Generate decision using LLM
      const llmStartTime = Date.now();
      const decision = await this.generateLLMDecision(input);
      const llmDuration = Date.now() - llmStartTime;
      
      this.logger.debug("bfis-commander-llm-decision-complete", {
        snapshotId,
        decisionId: decision.decisionId,
        actionCount: decision.actions.length,
        durationMs: llmDuration,
      });

      // Validate decision
      this.validateDecision(decision);

      // CRITICAL SAFETY: Enforce hostilities constraint (FR-010)
      // Strip ATTACK actions if hostilities have not started
      // This is a hard guard that prevents LLM misbehavior from violating the constraint
      if (!input.missionContext.hostilitiesStarted) {
        const attackActions = decision.actions.filter(a => a.type === "ATTACK");
        if (attackActions.length > 0) {
          this.logger.warn("bfis-commander-hostility-violation", {
            decisionId: decision.decisionId,
            snapshotId,
            attackActionsRemoved: attackActions.length,
            originalActionCount: decision.actions.length,
            message: "LLM generated ATTACK actions before hostilities started - actions removed",
          });
          
          // Remove ATTACK actions
          decision.actions = decision.actions.filter(a => a.type !== "ATTACK");
          
          // Update reasoning to reflect the constraint enforcement
          decision.reasoningNotes = `${decision.reasoningNotes}\n\nNOTE: ${attackActions.length} ATTACK action(s) were removed because hostilities have not started yet.`;
        }
      }

      // Enrich decision with metadata
      decision.snapshotId = input.intelSummary.snapshotId;
      decision.missionId = input.missionContext.missionId;
      decision.serverId = input.missionContext.serverId;
      decision.model = this.config.llm.model;

      // Log decision with full reasoning and performance metrics
      const totalDuration = Date.now() - startTime;
      this.logger.info("bfis-commander-decision-made", {
        decisionId: decision.decisionId,
        snapshotId: input.intelSummary.snapshotId,
        actionCount: decision.actions.length,
        actionTypes: decision.actions.map((a: { type: string }) => a.type),
        reasoningLength: decision.reasoningNotes?.length ?? 0,
        reasoningNotes: decision.reasoningNotes, // Full reasoning text
        actions: decision.actions, // Full actions with all details
        generationTimeMs: totalDuration,
        phaseDurations: {
          llmCheck: llmCheckDuration,
          llmGeneration: llmDuration,
        },
        usedFallback: false,
        timestamp: new Date().toISOString(),
      });

      return decision;
    } catch (error) {
      this.logger.error("bfis-commander-llm-error", {
        error: error instanceof Error ? error.message : String(error),
        fallbackUsed: this.enableRulesFallback,
      });

      // Fall back to rules-based decision-making
      if (this.enableRulesFallback) {
        return this.makeRulesBasedDecision(input);
      }

      throw error;
    }
  }

  /**
   * Generate decision using LLM.
   *
   * @param input - Commander agent input
   * @returns LLM-generated decision
   */
  private async generateLLMDecision(input: CommanderAgentInput): Promise<BfisDecision> {
    const prompt = this.buildPrompt(input);

      // Log the prompt being sent to LLM
      this.logger.info("bfis-commander-llm-prompt", {
        promptLength: prompt.length,
        prompt: prompt.substring(0, 1000), // First 1000 chars of prompt
      });

      const response = await this.llmClient.invoke(prompt, {
        temperature: this.config.agents?.commander.temperature ?? 0.7,
        maxTokens: this.config.agents?.commander.maxTokens ?? 4000,
      });

      // Log the raw LLM response
      this.logger.info("bfis-commander-llm-response", {
        responseLength: response.content.length,
        rawResponse: response.content, // Full LLM response
      });

    // Parse LLM response as JSON
    try {
      // Try to extract JSON from response (may be wrapped in markdown code blocks)
      let jsonText = response.content.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith("```")) {
        const lines = jsonText.split("\n");
        const startIdx = lines.findIndex((line) => line.trim().startsWith("```"));
        const endIdx = lines.findIndex((line, idx) => idx > startIdx && line.trim().startsWith("```"));
        if (startIdx >= 0 && endIdx > startIdx) {
          jsonText = lines.slice(startIdx + 1, endIdx).join("\n").trim();
        }
      }

      const parsed = JSON.parse(jsonText) as Partial<BfisDecision>;

      // Ensure required fields
      const decision: BfisDecision = {
        decisionId: parsed.decisionId || uuidv4(),
        actions: parsed.actions || [],
        reasoningNotes: parsed.reasoningNotes || "No reasoning provided",
        snapshotId: parsed.snapshotId,
        missionId: parsed.missionId,
        serverId: parsed.serverId,
        model: parsed.model,
      };

      return decision;
    } catch (parseError) {
      this.logger.error("bfis-commander-parse-error", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        responseSnippet: response.content.substring(0, 200),
      });
      throw new Error("Failed to parse LLM response as BfisDecision");
    }
  }

  /**
   * Build LLM prompt from Commander input.
   *
   * @param input - Commander agent input
   * @returns Prompt string for LLM
   */
  private buildPrompt(input: CommanderAgentInput): string {
    // Build detailed changes text
    const changesText = input.changes
      ? `Recent Changes:
- New Units (${input.changes.newUnits.length}): ${input.changes.newUnits.map(u => `${u.unitId} (${u.coalition} ${u.category})`).join(", ") || "None"}
- Destroyed Units (${input.changes.destroyedUnits.length}): ${input.changes.destroyedUnits.map(u => `${u.unitId} (${u.coalition})`).join(", ") || "None"}
- Moved Units (${input.changes.movedUnits.length}): ${input.changes.movedUnits.map(u => `${u.unitId}: (${u.oldPosition.lat.toFixed(4)}, ${u.oldPosition.lon.toFixed(4)}) → (${u.newPosition.lat.toFixed(4)}, ${u.newPosition.lon.toFixed(4)})`).join("; ") || "None"}
- Hostility Changed: ${input.changes.hostilityChanged}`
      : "";

    const previousDecisionText = input.previousDecision
      ? `Previous Decision:
- Decision ID: ${input.previousDecision.decisionId}
- Actions: ${input.previousDecision.actions.length}
- Action Types: ${input.previousDecision.actions.map(a => a.type).join(", ")}
- Reasoning: ${input.previousDecision.reasoningNotes?.substring(0, 300)}...`
      : "";

    const playerIntentText = input.playerIntent ? `Player Intent: ${input.playerIntent}` : "";

    // Build detailed key positions text
    const keyPositionsText = input.intelSummary.keyPositions.length > 0
      ? `Key Positions:
${input.intelSummary.keyPositions.map(p => `- ${p.type.toUpperCase()}${p.coalition ? ` (${p.coalition})` : ""}${p.label ? ` "${p.label}"` : ""}: (${p.position.lat.toFixed(4)}, ${p.position.lon.toFixed(4)}${p.position.altMeters ? `, ${p.position.altMeters}m` : ""})`).join("\n")}`
      : "Key Positions: None";

    // Build detailed threats text
    const threatsText = input.intelSummary.threats.length > 0
      ? `Threats:
${input.intelSummary.threats.map(t => `- ${t.coalition} [${t.severity.toUpperCase()}]: ${t.description}`).join("\n")}`
      : "Threats: None";

    // Build category breakdown
    const categoryBreakdown = Object.entries(input.intelSummary.categoryCounts)
      .map(([cat, count]) => `  - ${cat}: ${count}`)
      .join("\n");

    return `You are a tactical commander analyzing battlefield intelligence. Your role is to make strategic decisions based on the current battlefield state.

Mission Context:
- Mission ID: ${input.missionContext.missionId}
- Server ID: ${input.missionContext.serverId}
- Hostilities Started: ${input.missionContext.hostilitiesStarted}
- Current Time: ${input.missionContext.time}

Battlefield Overview:
- Unit Counts by Coalition:
  - BLUE: ${input.intelSummary.unitCounts.BLUE}
  - RED: ${input.intelSummary.unitCounts.RED}
  - NEUTRAL: ${input.intelSummary.unitCounts.NEUTRAL}
  - UNKNOWN: ${input.intelSummary.unitCounts.UNKNOWN}
  - TOTAL: ${Object.values(input.intelSummary.unitCounts).reduce((a, b) => a + b, 0)}

- Unit Counts by Category:
${categoryBreakdown || "  - No units detected"}

${keyPositionsText}

${threatsText}

${changesText}

${previousDecisionText}

${playerIntentText}

Decision Constraints:
- Maximum ${this.maxActionsPerDecision} actions per decision
- ${input.missionContext.hostilitiesStarted ? "Hostilities have started - ATTACK actions are allowed" : "Hostilities NOT started - NO ATTACK actions allowed. Only SPAWN, MOVE, RTB, HOLD, or CUSTOM actions are permitted"}
- Actions must be valid BfisAction types: SPAWN, MOVE, ATTACK, RTB, HOLD, CUSTOM
- Each action must have a valid target (unitId, groupId, coordinateRef, or zoneId)
- Actions should be tactical and strategic, not micro-management
- If there are no units in the battlefield, you may choose to spawn initial units or wait
- Consider the key positions (airbases, bullseyes) when planning spawn locations
- Use actual coordinates from key positions when available

Generate a tactical decision as JSON with this exact structure:
{
  "decisionId": "uuid-v4-string",
  "actions": [
    {
      "type": "SPAWN",
      "target": {
        "coordinateRef": { "lat": 40.0, "lon": -75.0, "altMeters": 10000 }
      },
      "params": {
        "unitType": "F-16C_50",
        "count": 2
      }
    }
  ],
  "reasoningNotes": "Explanation of why these actions were chosen"
}

Return ONLY valid JSON, no markdown formatting or additional text.`;
  }

  /**
   * Validate decision structure and constraints.
   *
   * @param decision - Decision to validate
   * @throws Error if validation fails
   */
  private validateDecision(decision: BfisDecision): void {
    if (!decision.actions || decision.actions.length === 0) {
      throw new Error("Decision must contain at least one action");
    }

    if (decision.actions.length > this.maxActionsPerDecision) {
      throw new Error(`Decision exceeds maximum actions (${this.maxActionsPerDecision})`);
    }

    if (!decision.reasoningNotes || decision.reasoningNotes.trim().length === 0) {
      throw new Error("Decision must include reasoning notes");
    }

    // Validate each action has required fields
    for (const action of decision.actions) {
      if (!action.type) {
        throw new Error("Action must have a type");
      }
      if (!action.target) {
        throw new Error("Action must have a target");
      }
    }
  }

  /**
   * Make rules-based fallback decision.
   *
   * @param input - Commander agent input
   * @returns Rules-based decision
   */
  private makeRulesBasedDecision(input: CommanderAgentInput): BfisDecision {
    return makeRulesBasedDecision(input.intelSummary, input.missionContext);
  }
}
