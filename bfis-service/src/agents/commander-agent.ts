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

    try {
      // Check if LLM is available
      const llmAvailable = await this.llmClient.isAvailable();

      if (!llmAvailable && this.enableRulesFallback) {
        this.logger.warn("bfis-commander-llm-unavailable", {
          message: "LLM unavailable, using rules-based fallback",
        });
        return this.makeRulesBasedDecision(input);
      }

      // Generate decision using LLM
      const decision = await this.generateLLMDecision(input);

      // Validate decision
      this.validateDecision(decision);

      // Enrich decision with metadata
      decision.snapshotId = input.intelSummary.snapshotId;
      decision.missionId = input.missionContext.missionId;
      decision.serverId = input.missionContext.serverId;
      decision.model = this.config.llm.model;

      // Log decision with full reasoning
      this.logger.info("bfis-commander-decision-made", {
        decisionId: decision.decisionId,
        snapshotId: input.intelSummary.snapshotId,
        actionCount: decision.actions.length,
        actionTypes: decision.actions.map((a: { type: string }) => a.type),
        reasoningLength: decision.reasoningNotes?.length ?? 0,
        reasoningNotes: decision.reasoningNotes, // Full reasoning text
        actions: decision.actions, // Full actions with all details
        generationTimeMs: Date.now() - startTime,
        usedFallback: false,
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
    const changesText = input.changes
      ? `Recent Changes:
- New Units: ${input.changes.newUnits.length}
- Destroyed Units: ${input.changes.destroyedUnits.length}
- Moved Units: ${input.changes.movedUnits.length}
- Hostility Changed: ${input.changes.hostilityChanged}`
      : "";

    const previousDecisionText = input.previousDecision
      ? `Previous Decision:
- Decision ID: ${input.previousDecision.decisionId}
- Actions: ${input.previousDecision.actions.length}
- Reasoning: ${input.previousDecision.reasoningNotes?.substring(0, 200)}...`
      : "";

    const playerIntentText = input.playerIntent ? `Player Intent: ${input.playerIntent}` : "";

    return `You are a tactical commander analyzing battlefield intelligence.

Mission Context:
- Mission ID: ${input.missionContext.missionId}
- Server ID: ${input.missionContext.serverId}
- Hostilities Started: ${input.missionContext.hostilitiesStarted}
- Current Time: ${input.missionContext.time}

Battlefield Summary:
- Unit Counts: BLUE=${input.intelSummary.unitCounts.BLUE}, RED=${input.intelSummary.unitCounts.RED}, NEUTRAL=${input.intelSummary.unitCounts.NEUTRAL}, UNKNOWN=${input.intelSummary.unitCounts.UNKNOWN}
- Category Counts: ${JSON.stringify(input.intelSummary.categoryCounts)}
- Key Positions: ${input.intelSummary.keyPositions.length}
- Threats: ${input.intelSummary.threats.map((t) => `${t.coalition} (${t.severity}): ${t.description}`).join(", ") || "None"}

${changesText}

${previousDecisionText}

${playerIntentText}

Constraints:
- Maximum ${this.maxActionsPerDecision} actions per decision
- ${input.missionContext.hostilitiesStarted ? "Hostilities have started - attacks allowed" : "Hostilities NOT started - NO attacks allowed, only spawn/move actions"}
- Actions must be valid BfisAction types: SPAWN, MOVE, ATTACK, RTB, HOLD, CUSTOM
- Each action must have a valid target (unitId, groupId, coordinateRef, or zoneId)
- Actions should be tactical and strategic, not micro-management

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
