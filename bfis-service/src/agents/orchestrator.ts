/**
 * Orchestrator: Coordinates three agents to complete full decision cycles.
 *
 * Uses a state machine to manage agent flow and error handling.
 * Processes cycles sequentially (one completes before next starts).
 *
 * Per spec-004: Orchestrator = Cycle Coordinator
 * - Coordinates Intel → Commander → Writer flow
 * - Manages state between cycles
 * - Handles errors and retries
 * - Integrates with polling loop
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/architecture/spec-004.md | spec-004.md}
 */

import type { AgentState, CommanderAgentInput, WriterAgentInput } from "./types.js";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { BfisContextSnapshot } from "../context/types.js";
import { IntelAgent } from "./intel-agent.js";
import { CommanderAgent } from "./commander-agent.js";
import { WriterAgent } from "./writer-agent.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Orchestrator: Coordinates three agents to complete full decision cycles.
 *
 * Uses a state machine to manage agent flow and error handling.
 * Processes cycles sequentially (one completes before next starts).
 */
export class Orchestrator {
  private previousSnapshotCache: Map<string, BfisContextSnapshot> = new Map(); // Key: sessionHash
  private isProcessingCycle: boolean = false; // Sequential cycle lock

  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Run a complete decision cycle from snapshot to command execution.
   *
   * @param initialState - Initial agent state with current snapshot
   * @returns Final agent state after cycle completion
   */
  async runCycle(initialState: AgentState): Promise<AgentState> {
    // Sequential cycle processing: wait if another cycle is in progress
    while (this.isProcessingCycle) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms and check again
    }

    this.isProcessingCycle = true;

    try {
      this.logger.info("bfis-orchestrator-cycle-started", {
        cycleId: initialState.cycleId,
        snapshotId: initialState.currentSnapshot?.base.snapshotId || "unknown",
        sessionHash: initialState.currentSnapshot?.base.sessionHash || "unknown",
      });

      // Check for session hash change and clear cache
      let state = { ...initialState };
      if (state.currentSnapshot) {
        const sessionHash = state.currentSnapshot.base.sessionHash;
        const cached = this.previousSnapshotCache.get(sessionHash);

        // Check if session hash changed (different from cached)
        if (cached && cached.base.sessionHash !== sessionHash) {
          // Session changed - clear cache
          this.previousSnapshotCache.clear();
          this.logger.info("bfis-orchestrator-session-reset", {
            oldSessionHash: cached.base.sessionHash,
            newSessionHash: sessionHash,
          });
        }

        // Set previous snapshot from cache
        state.previousSnapshot = cached || null;
      }

      // Step 1: Intel agent processes snapshot
      state = await this.runIntelNode(state);
      if (state.error && !state.error.recoverable) {
        state.cycleEndTime = new Date().toISOString();
        return state; // Fatal error - abort cycle
      }

      // Step 2: Commander agent makes decision
      state = await this.runCommanderNode(state);
      if (state.error && !state.error.recoverable) {
        state.cycleEndTime = new Date().toISOString();
        return state; // Fatal error - abort cycle
      }

      // Step 3: Writer agent translates to commands
      state = await this.runWriterNode(state);
      state.cycleEndTime = new Date().toISOString();

      // Cache current snapshot as previous for next cycle
      // Store the snapshot that was used as current in this cycle
      if (state.currentSnapshot) {
        const sessionHash = state.currentSnapshot.base.sessionHash;
        this.previousSnapshotCache.set(sessionHash, state.currentSnapshot);
        // Update previousSnapshot in state to reflect what will be cached for next cycle
        state.previousSnapshot = state.currentSnapshot;
      }

      // Log cycle completion
      const cycleDuration =
        state.cycleEndTime && state.cycleStartTime
          ? new Date(state.cycleEndTime).getTime() - new Date(state.cycleStartTime).getTime()
          : 0;

      this.logger.info("bfis-orchestrator-cycle-completed", {
        cycleId: state.cycleId,
        snapshotId: state.currentSnapshot?.base.snapshotId || "unknown",
        decisionId: state.decision?.decisionId || null,
        commandCount: state.commandResults?.length || 0,
        cycleDurationMs: cycleDuration,
        error: state.error !== null,
      });

      return state;
    } catch (error) {
      this.logger.error("bfis-orchestrator-cycle-error", {
        cycleId: initialState.cycleId,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorState: AgentState = {
        ...initialState,
        error: {
          agent: "orchestrator",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
        cycleEndTime: new Date().toISOString(),
      };

      return errorState;
    } finally {
      this.isProcessingCycle = false;
    }
  }

  /**
   * Intel node: Process snapshot and generate summary.
   */
  private async runIntelNode(state: AgentState): Promise<AgentState> {
    if (!state.currentSnapshot) {
      return {
        ...state,
        error: {
          agent: "intel",
          message: "No current snapshot provided",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    try {
      const intelAgent = new IntelAgent(this.config, this.logger);
      const intelOutput = await intelAgent.process(state.currentSnapshot, state.previousSnapshot);

      return {
        ...state,
        intelOutput,
        previousSnapshot: state.currentSnapshot, // Cache for next cycle
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-intel-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...state,
        error: {
          agent: "intel",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          recoverable: true, // Intel errors are recoverable (can continue with empty summary)
        },
      };
    }
  }

  /**
   * Commander node: Make decision from Intel output.
   */
  private async runCommanderNode(state: AgentState): Promise<AgentState> {
    if (!state.intelOutput || !state.currentSnapshot) {
      return {
        ...state,
        error: {
          agent: "commander",
          message: "No Intel output or snapshot available",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    try {
      const commanderAgent = new CommanderAgent(this.config, this.logger);
      const commanderInput = this.buildCommanderInput(state);
      const decision = await commanderAgent.makeDecision(commanderInput);

      return {
        ...state,
        decision,
        commanderInput,
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-commander-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...state,
        error: {
          agent: "commander",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          recoverable: true, // Commander errors are recoverable (can use rules fallback)
        },
      };
    }
  }

  /**
   * Writer node: Translate decision to commands.
   */
  private async runWriterNode(state: AgentState): Promise<AgentState> {
    if (!state.decision) {
      return {
        ...state,
        error: {
          agent: "writer",
          message: "No decision available",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    try {
      const writerAgent = new WriterAgent(this.config, this.logger);
      const writerInput = this.buildWriterInput(state);
      const commandResults = await writerAgent.executeCommands(writerInput);

      return {
        ...state,
        commandResults,
        writerInput,
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-writer-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...state,
        error: {
          agent: "writer",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          recoverable: true, // Writer errors are recoverable (commands can be retried)
        },
      };
    }
  }

  /**
   * Build Commander input from state.
   */
  private buildCommanderInput(state: AgentState): CommanderAgentInput {
    if (!state.intelOutput || !state.currentSnapshot) {
      throw new Error("Cannot build Commander input: missing Intel output or snapshot");
    }

    return {
      intelSummary: state.intelOutput.summary,
      changes: state.intelOutput.changes,
      missionContext: {
        missionId: state.currentSnapshot.base.missionId,
        serverId: state.currentSnapshot.base.serverId,
        sessionHash: state.currentSnapshot.base.sessionHash,
        time: state.currentSnapshot.base.time,
        hostilitiesStarted: state.currentSnapshot.hostility.hostilitiesStarted,
      },
      previousDecision: state.decision || undefined,
    };
  }

  /**
   * Build Writer input from state.
   */
  private buildWriterInput(state: AgentState): WriterAgentInput {
    if (!state.decision) {
      throw new Error("Cannot build Writer input: missing decision");
    }

    return {
      decision: state.decision,
      availableCommands: [
        "spawnAircrafts",
        "spawnHelicopters",
        "setPath",
        "setGroupRoute",
        "landAt",
        "attackUnit",
        "bombPoint",
        "returnToBase",
        "holdPosition",
      ],
    };
  }
}
