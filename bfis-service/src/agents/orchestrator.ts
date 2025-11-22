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
  private lastSessionHash: string | null = null; // Track previous session hash to detect changes
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

        // Check if session hash changed (different from last seen session)
        if (this.lastSessionHash !== null && this.lastSessionHash !== sessionHash) {
          // Session changed - clear cache for all sessions
          this.previousSnapshotCache.clear();
          this.logger.info("bfis-orchestrator-session-reset", {
            oldSessionHash: this.lastSessionHash,
            newSessionHash: sessionHash,
          });
        }

        // Get cached previous snapshot for this session
        const cached = this.previousSnapshotCache.get(sessionHash);

        // Set previous snapshot from cache (will be null if cache was cleared or first cycle)
        state.previousSnapshot = cached || null;

        // Update last seen session hash
        this.lastSessionHash = sessionHash;
      }

      // Track phase durations for performance monitoring
      let intelDuration = 0;
      let commanderDuration = 0;
      let writerDuration = 0;

      // Step 1: Intel agent processes snapshot
      const intelStartTime = Date.now();
      this.logger.debug("bfis-orchestrator-phase-start", {
        cycleId: state.cycleId,
        phase: "intel",
        snapshotId: state.currentSnapshot?.base.snapshotId,
        hasPreviousSnapshot: state.previousSnapshot !== null,
        timestamp: new Date().toISOString(),
      });
      state = await this.runIntelNode(state);
      intelDuration = Date.now() - intelStartTime;
      this.logger.debug("bfis-orchestrator-phase-complete", {
        cycleId: state.cycleId,
        phase: "intel",
        durationMs: intelDuration,
        hasIntelOutput: state.intelOutput !== null,
        unitCount: state.intelOutput?.summary.unitCounts ? Object.values(state.intelOutput.summary.unitCounts).reduce((a, b) => a + b, 0) : 0,
        hasChanges: state.intelOutput?.changes !== undefined,
        timestamp: new Date().toISOString(),
      });
      if (state.error && !state.error.recoverable) {
        state.cycleEndTime = new Date().toISOString();
        return state; // Fatal error - abort cycle
      }

      // Step 2: Commander agent makes decision
      const commanderStartTime = Date.now();
      this.logger.debug("bfis-orchestrator-phase-start", {
        cycleId: state.cycleId,
        phase: "commander",
        snapshotId: state.currentSnapshot?.base.snapshotId,
        hasIntelOutput: state.intelOutput !== null,
        timestamp: new Date().toISOString(),
      });
      state = await this.runCommanderNode(state);
      commanderDuration = Date.now() - commanderStartTime;
      this.logger.debug("bfis-orchestrator-phase-complete", {
        cycleId: state.cycleId,
        phase: "commander",
        durationMs: commanderDuration,
        hasDecision: state.decision !== null,
        actionCount: state.decision?.actions.length || 0,
        timestamp: new Date().toISOString(),
      });
      if (state.error && !state.error.recoverable) {
        state.cycleEndTime = new Date().toISOString();
        return state; // Fatal error - abort cycle
      }

      // Step 3: Writer agent translates to commands
      const writerStartTime = Date.now();
      this.logger.debug("bfis-orchestrator-phase-start", {
        cycleId: state.cycleId,
        phase: "writer",
        snapshotId: state.currentSnapshot?.base.snapshotId,
        hasDecision: state.decision !== null,
        actionCount: state.decision?.actions.length || 0,
        timestamp: new Date().toISOString(),
      });
      state = await this.runWriterNode(state);
      writerDuration = Date.now() - writerStartTime;
      this.logger.debug("bfis-orchestrator-phase-complete", {
        cycleId: state.cycleId,
        phase: "writer",
        durationMs: writerDuration,
        commandCount: state.commandResults?.length || 0,
        successfulCommands: state.commandResults?.filter(cr => cr.status === "SENT" || cr.status === "CONFIRMED" || cr.status === "LOGGED").length || 0,
        failedCommands: state.commandResults?.filter(cr => cr.status === "FAILED").length || 0,
        timestamp: new Date().toISOString(),
      });
      state.cycleEndTime = new Date().toISOString();

      // Cache current snapshot as previous for next cycle
      // Store the snapshot that was used as current in this cycle
      if (state.currentSnapshot) {
        const sessionHash = state.currentSnapshot.base.sessionHash;
        this.previousSnapshotCache.set(sessionHash, state.currentSnapshot);
        // Update previousSnapshot in state to reflect what will be cached for next cycle
        state.previousSnapshot = state.currentSnapshot;
      }

      // Log cycle completion with detailed performance metrics
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
        phaseDurations: {
          intel: intelDuration,
          commander: commanderDuration,
          writer: writerDuration,
        },
        phasePercentages: {
          intel: cycleDuration > 0 ? ((intelDuration / cycleDuration) * 100).toFixed(1) : "0.0",
          commander: cycleDuration > 0 ? ((commanderDuration / cycleDuration) * 100).toFixed(1) : "0.0",
          writer: cycleDuration > 0 ? ((writerDuration / cycleDuration) * 100).toFixed(1) : "0.0",
        },
        dataFlow: {
          inputUnits: state.currentSnapshot?.base.units.length || 0,
          outputSummary: state.intelOutput?.summary ? {
            totalUnits: Object.values(state.intelOutput.summary.unitCounts).reduce((a, b) => a + b, 0),
            threats: state.intelOutput.summary.threats.length,
          } : null,
          outputActions: state.decision?.actions.length || 0,
          outputCommands: state.commandResults?.length || 0,
        },
        error: state.error !== null,
        timestamp: new Date().toISOString(),
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
    const nodeStartTime = Date.now();
    
    if (!state.currentSnapshot) {
      this.logger.warn("bfis-orchestrator-intel-skip", {
        cycleId: state.cycleId,
        reason: "No current snapshot provided",
        durationMs: Date.now() - nodeStartTime,
      });
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
      this.logger.debug("bfis-orchestrator-intel-input", {
        cycleId: state.cycleId,
        snapshotId: state.currentSnapshot.base.snapshotId,
        unitCount: state.currentSnapshot.base.units.length,
        hasPreviousSnapshot: state.previousSnapshot !== null,
        previousSnapshotId: state.previousSnapshot?.base.snapshotId || null,
      });

      const intelAgent = new IntelAgent(this.config, this.logger);
      const intelOutput = await intelAgent.process(state.currentSnapshot, state.previousSnapshot);

      this.logger.debug("bfis-orchestrator-intel-output", {
        cycleId: state.cycleId,
        summaryUnitCount: Object.values(intelOutput.summary.unitCounts).reduce((a, b) => a + b, 0),
        threatCount: intelOutput.summary.threats.length,
        hasChanges: intelOutput.changes !== undefined,
        changeCount: intelOutput.changes ? (intelOutput.changes.newUnits.length + intelOutput.changes.destroyedUnits.length + intelOutput.changes.movedUnits.length) : 0,
        durationMs: Date.now() - nodeStartTime,
      });

      return {
        ...state,
        intelOutput,
        previousSnapshot: state.currentSnapshot, // Cache for next cycle
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-intel-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - nodeStartTime,
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
    const nodeStartTime = Date.now();
    
    if (!state.intelOutput || !state.currentSnapshot) {
      this.logger.warn("bfis-orchestrator-commander-skip", {
        cycleId: state.cycleId,
        reason: "No Intel output or snapshot available",
        hasIntelOutput: state.intelOutput !== null,
        hasSnapshot: state.currentSnapshot !== null,
        durationMs: Date.now() - nodeStartTime,
      });
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
      this.logger.debug("bfis-orchestrator-commander-input", {
        cycleId: state.cycleId,
        snapshotId: state.currentSnapshot.base.snapshotId,
        summaryUnitCount: Object.values(state.intelOutput.summary.unitCounts).reduce((a, b) => a + b, 0),
        hasChanges: state.intelOutput.changes !== undefined,
        hasPreviousDecision: state.decision !== null,
      });

      const commanderAgent = new CommanderAgent(this.config, this.logger);
      const commanderInput = this.buildCommanderInput(state);
      const decision = await commanderAgent.makeDecision(commanderInput);

      this.logger.debug("bfis-orchestrator-commander-output", {
        cycleId: state.cycleId,
        decisionId: decision.decisionId,
        actionCount: decision.actions.length,
        actionTypes: decision.actions.map(a => a.type),
        reasoningLength: decision.reasoningNotes?.length || 0,
        durationMs: Date.now() - nodeStartTime,
      });

      return {
        ...state,
        decision,
        commanderInput,
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-commander-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - nodeStartTime,
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
    const nodeStartTime = Date.now();
    
    if (!state.decision) {
      this.logger.warn("bfis-orchestrator-writer-skip", {
        cycleId: state.cycleId,
        reason: "No decision available",
        durationMs: Date.now() - nodeStartTime,
      });
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
      this.logger.debug("bfis-orchestrator-writer-input", {
        cycleId: state.cycleId,
        decisionId: state.decision.decisionId,
        actionCount: state.decision.actions.length,
        actionTypes: state.decision.actions.map(a => a.type),
      });

      const writerAgent = new WriterAgent(this.config, this.logger);
      const writerInput = this.buildWriterInput(state);
      const commandResults = await writerAgent.executeCommands(writerInput);

      this.logger.debug("bfis-orchestrator-writer-output", {
        cycleId: state.cycleId,
        commandCount: commandResults.length,
        successfulCommands: commandResults.filter(cr => cr.status === "SENT" || cr.status === "CONFIRMED" || cr.status === "LOGGED").length,
        failedCommands: commandResults.filter(cr => cr.status === "FAILED").length,
        durationMs: Date.now() - nodeStartTime,
      });

      return {
        ...state,
        commandResults,
        writerInput,
      };
    } catch (error) {
      this.logger.error("bfis-orchestrator-writer-error", {
        cycleId: state.cycleId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - nodeStartTime,
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
