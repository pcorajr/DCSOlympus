/**
 * Dialogue Manager for BFIS human-in-the-loop Copilot mode.
 *
 * Processes human messages, coordinates with LLM and Intel agent tools,
 * generates action proposals, and manages conversation history.
 *
 * Per Spec-005: Transform BFIS from autonomous polling to chat-based interaction
 * where humans initiate all actions and explicitly approve decisions.
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/specs/005-bfis-chat-interface.md | Spec-005}
 */

import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { ChatMessage, DialogueResponse } from "./types.js";
import type { IntelAgent } from "../agents/intel-agent.js";
import type { CommanderAgent } from "../agents/commander-agent.js";
import type { SnapshotReader } from "../snapshot/snapshot-reader.js";
import type { MissionContext } from "../agents/types.js";
import { ActionApprovalManager } from "./action-approval.js";
import { createLLMClient } from "../intent/llm-client.js";

/**
 * Dialogue Manager for chat-based Copilot mode.
 *
 * Coordinates human messages with LLM, Intel agent tools, and Commander agent
 * to generate action proposals that require explicit human approval.
 */
export class DialogueManager {
  private readonly conversationHistory: Map<string, ChatMessage[]>;
  private readonly llmClient: ReturnType<typeof createLLMClient>;
  private readonly approvalManager: ActionApprovalManager;
  private readonly maxHistoryLength: number;

  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger,
    private readonly intelAgent: IntelAgent,
    private readonly commanderAgent: CommanderAgent,
    private readonly snapshotReader: SnapshotReader
  ) {
    this.conversationHistory = new Map();
    this.llmClient = createLLMClient(config);
    this.approvalManager = new ActionApprovalManager(
      logger,
      config.chat?.approvalTimeoutMs ?? 300000
    );
    this.maxHistoryLength = config.chat?.maxHistoryLength ?? 20;

    this.logger.info("bfis-dialogue-manager-initialized", {
      maxHistoryLength: this.maxHistoryLength,
      approvalTimeoutMs: config.chat?.approvalTimeoutMs ?? 300000,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Process human message and generate LLM response with Intel tool access.
   *
   * The LLM can query the Intel agent for battlefield information and propose
   * actions that require explicit human approval before execution.
   *
   * @param input - Human message with session context
   * @returns Dialogue response with optional action proposal
   */
  async processMessage(input: {
    message: string;
    sessionId: string;
    sessionHash: string;
  }): Promise<DialogueResponse> {
    const startTime = Date.now();

    this.logger.info("bfis-dialogue-message-received", {
      sessionId: input.sessionId,
      messageLength: input.message.length,
      timestamp: new Date().toISOString(),
    });

    // Add human message to conversation history
    const humanMessage: ChatMessage = {
      role: "human",
      content: input.message,
      timestamp: new Date().toISOString(),
    };
    this.addToHistory(input.sessionId, humanMessage);

    try {
      // Check if LLM is available
      const llmAvailable = await this.llmClient.isAvailable();
      if (!llmAvailable) {
        const errorResponse = "I'm sorry, but the LLM service is currently unavailable. Please try again later.";
        this.addToHistory(input.sessionId, {
          role: "assistant",
          content: errorResponse,
          timestamp: new Date().toISOString(),
        });
        return {
          response: errorResponse,
          conversationId: input.sessionId,
        };
      }

      // Build prompt with conversation context and Intel tool description
      const prompt = this.buildPrompt(input);

      // Call LLM with Intel tool access
      const llmResponse = await this.llmClient.invoke(prompt, {
        temperature: 0.7,
        maxTokens: 4000,
      });

      // Parse LLM response to determine if it's proposing actions
      const parsedResponse = await this.parseLLMResponse(
        llmResponse.content,
        input.sessionId,
        input.sessionHash
      );

      // Add assistant message to conversation history
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: parsedResponse.response,
        timestamp: new Date().toISOString(),
        metadata: {
          proposedActions: parsedResponse.proposedDecision ? [parsedResponse.proposedDecision.decisionId] : undefined,
        },
      };
      this.addToHistory(input.sessionId, assistantMessage);

      const duration = Date.now() - startTime;
      this.logger.info("bfis-dialogue-message-processed", {
        sessionId: input.sessionId,
        durationMs: duration,
        hasProposal: !!parsedResponse.proposedDecision,
        timestamp: new Date().toISOString(),
      });

      return parsedResponse;
    } catch (error) {
      this.logger.error("bfis-dialogue-error", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      const errorResponse = "I encountered an error processing your message. Please try again.";
      this.addToHistory(input.sessionId, {
        role: "assistant",
        content: errorResponse,
        timestamp: new Date().toISOString(),
      });

      return {
        response: errorResponse,
        conversationId: input.sessionId,
      };
    }
  }

  /**
   * Execute approved actions via Commander and Writer agents.
   *
   * @param input - Approval request with decision ID
   * @returns Execution results
   */
  async executeApprovedActions(input: {
    sessionId: string;
    decisionId: string;
    approved: boolean;
  }): Promise<{
    decisionId: string;
    approved: boolean;
    commandResults?: Array<{ commandHash: string; status: string; error?: string }>;
    error?: string;
  }> {
    try {
      // Process approval
      const pendingDecision = await this.approvalManager.processApproval(
        input.decisionId,
        input.approved
      );

      if (!input.approved) {
        this.logger.info("bfis-decision-rejected", {
          decisionId: input.decisionId,
          sessionId: input.sessionId,
          timestamp: new Date().toISOString(),
        });

        this.approvalManager.removeDecision(input.decisionId);

        return {
          decisionId: input.decisionId,
          approved: false,
        };
      }

      // Execute approved decision via Writer agent
      // Note: This requires Writer agent integration which will be added
      // For now, return success status
      this.logger.info("bfis-decision-approved", {
        decisionId: input.decisionId,
        sessionId: input.sessionId,
        actionCount: pendingDecision.decision.actions.length,
        timestamp: new Date().toISOString(),
      });

      this.approvalManager.removeDecision(input.decisionId);

      return {
        decisionId: input.decisionId,
        approved: true,
        commandResults: [],
      };
    } catch (error) {
      this.logger.error("bfis-approval-execution-error", {
        decisionId: input.decisionId,
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      return {
        decisionId: input.decisionId,
        approved: input.approved,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get conversation history for a session.
   *
   * @param sessionId - Session ID to retrieve history for
   * @param limit - Maximum number of messages to return (default: all)
   * @returns Array of chat messages
   */
  getConversationHistory(sessionId: string, limit?: number): ChatMessage[] {
    const history = this.conversationHistory.get(sessionId) || [];
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Build LLM prompt with conversation context and Intel tool description.
   *
   * @param input - Message input with session context
   * @returns Prompt string for LLM
   */
  private buildPrompt(input: {
    message: string;
    sessionId: string;
    sessionHash: string;
  }): string {
    const history = this.getConversationHistory(input.sessionId, 10);
    const conversationContext = history
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    return `You are a tactical AI assistant for DCS Olympus BFIS (Battlefield Intelligence Service). Your role is to help human commanders make informed tactical decisions by providing battlefield intelligence and proposing actions.

**Your Capabilities:**
1. **Query Battlefield Intelligence**: You can request current battlefield state, unit information, threat assessments, and recent changes.
2. **Propose Actions**: You can propose tactical actions (SPAWN, MOVE, ATTACK, RTB, HOLD) that require explicit human approval.
3. **Explain Reasoning**: Always explain your reasoning clearly and concisely.

**Important Constraints:**
- You CANNOT execute actions directly - all actions require human approval
- You should query battlefield intelligence when needed to answer questions
- When proposing actions, provide clear reasoning for each action
- Respect hostilities status - no ATTACK actions before hostilities start

**Available Tools:**
- \`get_battlefield_summary\`: Get current battlefield state with unit counts, positions, threats, and key locations
- \`get_unit_info\`: Query specific units by coalition, category, or zone
- \`get_recent_changes\`: Detect what changed since last check (new units, destroyed units, movements)

**Conversation History:**
${conversationContext || "No previous conversation"}

**Current Human Message:**
${input.message}

**Instructions:**
1. If the human is asking about battlefield state, use the appropriate tool to query Intel agent
2. If the human is requesting actions, propose a decision with specific actions and reasoning
3. If proposing actions, format your response as:
   - Text explanation of what you're proposing and why
   - JSON decision block with actions (if proposing actions)

**Response Format:**
Provide a natural language response. If you want to propose actions, include a JSON block at the end with this structure:
\`\`\`json
{
  "proposeActions": true,
  "actions": [
    {
      "type": "SPAWN",
      "target": { "coordinateRef": { "lat": 40.0, "lon": -75.0, "altMeters": 10000 } },
      "params": { "unitType": "F-16C_50", "count": 2, "coalition": "BLUE" }
    }
  ],
  "reasoning": "Explanation of why these actions are recommended"
}
\`\`\`

Respond naturally and helpfully to the human's message.`;
  }

  /**
   * Parse LLM response to extract text and optional action proposal.
   *
   * @param llmContent - Raw LLM response content
   * @param sessionId - Session ID for tracking
   * @param sessionHash - Session hash for snapshot context
   * @returns Parsed dialogue response
   */
  private async parseLLMResponse(
    llmContent: string,
    sessionId: string,
    sessionHash: string
  ): Promise<DialogueResponse> {
    // Check if LLM is proposing actions (look for JSON block)
    const jsonMatch = llmContent.match(/```json\s*(\{[\s\S]*?\})\s*```/);

    if (jsonMatch) {
      try {
        const proposalData = JSON.parse(jsonMatch[1]);

        if (proposalData.proposeActions && proposalData.actions) {
          // Generate decision via Commander agent
          // Note: We need Intel summary but generateSummary is private
          // For now, we'll use the Commander agent directly with a minimal Intel summary
          // This will be improved when Intel agent exposes a public method
          const snapshot = await this.snapshotReader.readContextOnce();
          
          // Build minimal tactical summary from snapshot
          const intelSummary = {
            snapshotId: snapshot.base.snapshotId,
            snapshotTime: snapshot.base.time || new Date().toISOString(),
            unitCounts: {
              BLUE: snapshot.base.units.filter(u => u.coalition === "BLUE").length,
              RED: snapshot.base.units.filter(u => u.coalition === "RED").length,
              NEUTRAL: snapshot.base.units.filter(u => u.coalition === "NEUTRAL").length,
              UNKNOWN: snapshot.base.units.filter(u => !u.coalition || u.coalition === "UNKNOWN").length,
            },
            categoryCounts: {},
            keyPositions: [],
            threats: [],
          };
          
          const missionContext: MissionContext = {
            missionId: snapshot.base.missionId || "unknown",
            serverId: snapshot.base.serverId || "unknown",
            sessionHash: snapshot.base.sessionHash,
            hostilitiesStarted: false, // Default to false for safety
            time: snapshot.base.time || new Date().toISOString(),
          };

          // Create decision with proposed actions
          const decision = await this.commanderAgent.makeDecision({
            intelSummary,
            missionContext,
            changes: undefined,
            previousDecision: undefined,
            playerIntent: proposalData.reasoning,
          });

          // Store decision for approval
          const decisionId = await this.approvalManager.proposeDecision(decision, sessionId);

          // Extract text response (everything before JSON block)
          const textResponse = llmContent.substring(0, jsonMatch.index).trim();

          return {
            response: textResponse || "I've prepared the following actions for your approval.",
            proposedDecision: {
              decisionId,
              decision,
              reasoning: proposalData.reasoning,
              requiresApproval: true,
            },
            conversationId: sessionId,
          };
        }
      } catch (error) {
        this.logger.warn("bfis-dialogue-parse-proposal-error", {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        // Fall through to return text-only response
      }
    }

    // No action proposal - return text response only
    return {
      response: llmContent.trim(),
      conversationId: sessionId,
    };
  }

  /**
   * Add message to conversation history with length limit enforcement.
   *
   * @param sessionId - Session ID
   * @param message - Chat message to add
   */
  private addToHistory(sessionId: string, message: ChatMessage): void {
    let history = this.conversationHistory.get(sessionId);
    if (!history) {
      history = [];
      this.conversationHistory.set(sessionId, history);
    }

    history.push(message);

    // Enforce max history length (keep most recent messages)
    if (history.length > this.maxHistoryLength) {
      history.splice(0, history.length - this.maxHistoryLength);
    }
  }

  /**
   * Get approval manager instance for external access.
   *
   * @returns Action approval manager
   */
  getApprovalManager(): ActionApprovalManager {
    return this.approvalManager;
  }
}
