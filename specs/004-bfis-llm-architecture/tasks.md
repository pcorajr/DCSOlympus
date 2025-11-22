# Tasks: Multi-Agent LLM Architecture for BFIS

**Input**: Design documents from `/specs/004-bfis-llm-architecture/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included for all user stories to ensure quality and independent testability.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **BFIS Service**: `bfis-service/src/agents/` for agent code
- **Tests**: `bfis-service/src/agents/__tests__/` (co-located with code)
- **Types**: `bfis-service/src/agents/types.ts` (already exists)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, and configuration setup

- [X] T001 Install LangGraph and LangChain dependencies in `bfis-service/package.json`

  **Code snippet to guide implementation:**
  ```json
  {
    "dependencies": {
      "@langchain/langgraph": "^0.2.0",
      "@langchain/core": "^0.3.0",
      "@turf/turf": "^6.5.0",
      "lodash": "^4.17.21"
    },
    "devDependencies": {
      "@types/lodash": "^4.17.0"
    }
  }
  ```
  Run: `cd bfis-service && npm install`

- [X] T002 [P] Create agent directory structure in `bfis-service/src/agents/`

  **Code snippet to guide implementation:**
  ```bash
  mkdir -p bfis-service/src/agents/tools
  mkdir -p bfis-service/src/agents/__tests__
  mkdir -p bfis-service/src/agents/__tests__/tools
  ```
  Create empty placeholder files:
  - `bfis-service/src/agents/intel-agent.ts`
  - `bfis-service/src/agents/commander-agent.ts`
  - `bfis-service/src/agents/writer-agent.ts`
  - `bfis-service/src/agents/orchestrator.ts`
  - `bfis-service/src/agents/tools/snapshot-tools.ts`
  - `bfis-service/src/agents/tools/index.ts`

- [X] T003 [P] Extend BfisConfig interface with AgentConfig in `bfis-service/src/config/config.ts`

  **Code snippet to guide implementation:**
  ```typescript
  /**
   * Agent-specific configuration for multi-agent LLM architecture.
   * 
   * Extends base BfisConfig with agent-specific settings for Intel, Commander, Writer, and Orchestrator.
   */
  export interface AgentConfig {
    intel: {
      pollingIntervalMs: number;        // Default: 2000
      enableChangeDetection: boolean;    // Default: true
      positionChangeThresholdMeters: number; // Default: 1000
      maxTokens: number;                 // Default: 2000
      temperature: number;               // Default: 0.3
    };
    commander: {
      maxTokens: number;                 // Default: 4000
      temperature: number;               // Default: 0.7
      enableRulesFallback: boolean;      // Default: true
      maxActionsPerDecision: number;     // Default: 10
    };
    writer: {
      maxTokens: number;                 // Default: 2000
      temperature: number;               // Default: 0.2
      enableCommandValidation: boolean;  // Default: true
      commandExecutionMode: "log" | "execute"; // Default: "log"
    };
    orchestrator: {
      enableCheckpointing: boolean;      // Default: false
      maxCycles: number;                 // Default: 10
      cycleTimeoutMs: number;            // Default: 30000
    };
  }

  // Add to BfisConfig interface:
  export interface BfisConfig {
    // ... existing fields ...
    agents?: AgentConfig;  // Optional, uses defaults if not provided
  }
  ```

- [X] T004 [P] Add agent configuration resolution functions in `bfis-service/src/config/config.ts`

  **Code snippet to guide implementation:**
  ```typescript
  /**
   * Resolve agent configuration with defaults.
   * 
   * @returns Agent configuration with all defaults applied
   */
  function resolveAgentConfig(): AgentConfig {
    return {
      intel: {
        pollingIntervalMs: Number(process.env.BFIS_AGENT_INTEL_POLLING_MS ?? 2000),
        enableChangeDetection: process.env.BFIS_AGENT_INTEL_CHANGE_DETECTION !== "false",
        positionChangeThresholdMeters: Number(process.env.BFIS_AGENT_INTEL_POSITION_THRESHOLD_M ?? 1000),
        maxTokens: Number(process.env.BFIS_AGENT_INTEL_MAX_TOKENS ?? 2000),
        temperature: Number(process.env.BFIS_AGENT_INTEL_TEMPERATURE ?? 0.3),
      },
      commander: {
        maxTokens: Number(process.env.BFIS_AGENT_COMMANDER_MAX_TOKENS ?? 4000),
        temperature: Number(process.env.BFIS_AGENT_COMMANDER_TEMPERATURE ?? 0.7),
        enableRulesFallback: process.env.BFIS_AGENT_COMMANDER_RULES_FALLBACK !== "false",
        maxActionsPerDecision: Number(process.env.BFIS_AGENT_COMMANDER_MAX_ACTIONS ?? 10),
      },
      writer: {
        maxTokens: Number(process.env.BFIS_AGENT_WRITER_MAX_TOKENS ?? 2000),
        temperature: Number(process.env.BFIS_AGENT_WRITER_TEMPERATURE ?? 0.2),
        enableCommandValidation: process.env.BFIS_AGENT_WRITER_VALIDATION !== "false",
        commandExecutionMode: (process.env.BFIS_COMMAND_EXECUTION_MODE ?? "log") as "log" | "execute",
      },
      orchestrator: {
        enableCheckpointing: process.env.BFIS_ORCHESTRATOR_CHECKPOINTING === "true",
        maxCycles: Number(process.env.BFIS_ORCHESTRATOR_MAX_CYCLES ?? 10),
        cycleTimeoutMs: Number(process.env.BFIS_ORCHESTRATOR_TIMEOUT_MS ?? 30000),
      },
    };
  }

  // Update loadConfig() to include agents config:
  export function loadConfig(): BfisConfig {
    return {
      // ... existing config fields ...
      agents: resolveAgentConfig(),
    };
  }
  ```

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Verify types.ts exists and contains all required interfaces in `bfis-service/src/agents/types.ts`

  **Code snippet to guide verification:**
  ```typescript
  // Verify these interfaces exist (they should already be present):
  // - TacticalSummary
  // - SnapshotDelta
  // - MissionContext
  // - IntelAgentOutput
  // - CommanderAgentInput
  // - WriterAgentInput
  // - CommandResult
  // - AgentError
  // - AgentState
  
  // If any are missing, add them based on data-model.md specifications
  ```

- [X] T006 [P] Create LLM client abstraction interface in `bfis-service/src/intent/llm-client.ts`

  **Code snippet to guide implementation:**
  ```typescript
  /**
   * LLM client abstraction for provider-agnostic LLM calls.
   * 
   * Supports Ollama, LLMstudio (MVP), extensible to OpenAI/Anthropic (future).
   * All agents use this interface for LLM interactions.
   */
  export interface LLMClient {
    /**
     * Invoke LLM with prompt and options.
     * 
     * @param prompt - The prompt text to send to LLM
     * @param options - LLM invocation options (temperature, maxTokens, etc.)
     * @returns LLM response with content
     * @throws Error if LLM service unavailable or request fails
     */
    invoke(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
    
    /**
     * Check if LLM service is available.
     * 
     * @returns True if LLM service is reachable, false otherwise
     */
    isAvailable(): Promise<boolean>;
  }

  export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
  }

  export interface LLMResponse {
    content: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }

  /**
   * Create LLM client based on configuration.
   * 
   * @param config - BFIS configuration containing LLM settings
   * @returns LLM client instance
   * @throws Error if provider not supported or configuration invalid
   */
  export function createLLMClient(config: BfisConfig): LLMClient {
    // Implementation: Create OllamaClient, LLMStudioClient, or return null client for rules-only mode
    // If provider is "none" or unavailable, return a no-op client that throws on invoke()
  }
  ```

- [X] T007 [P] Create rules-based fallback module in `bfis-service/src/agents/rules-fallback.ts`

  **Code snippet to guide implementation:**
  ```typescript
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
      p => p.type === "airbase" && p.coalition === "BLUE"
    );
    if (blueAirbases.length > 0) {
      reasoningNotes.push(`Protecting ${blueAirbases.length} BLUE airbase(s)`);
      // Add defensive spawn actions near airbases if threats detected
    }
    
    // Rule 2: Spawn defensive units near high-severity threats
    const highThreats = intelSummary.threats.filter(t => t.severity === "high");
    if (highThreats.length > 0 && missionContext.hostilitiesStarted) {
      reasoningNotes.push(`Addressing ${highThreats.length} high-severity threat(s)`);
      // Add defensive spawn actions
    }
    
    // Rule 3: Never attack before hostilities begin
    if (!missionContext.hostilitiesStarted) {
      // Only spawn/move actions, no attacks
    }
    
    return {
      decisionId: uuidv4(),
      actions,
      reasoningNotes: reasoningNotes.join("; "),
      timestamp: new Date().toISOString(),
    };
  }
  ```

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - BFIS Observes and Summarizes Battlefield State (Priority: P1) 🎯 MVP

**Goal**: BFIS observes current battlefield state from Olympus and generates high-level tactical summaries containing unit counts, key positions, and threat assessments.

**Independent Test**: Verify that BFIS successfully observes battlefield state from Olympus and produces tactical summaries containing unit counts by coalition, key positions (airbases, bullseyes, clusters), and threat assessments.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T008 [P] [US1] Create unit test for Intel agent summary generation in `bfis-service/src/agents/__tests__/intel-agent.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/intel-agent.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { IntelAgent } from "../intel-agent.js";
  import type { BfisContextSnapshot } from "../../context/types.js";
  import { loadConfig } from "../../config/config.js";
  import { createStructuredLogger } from "../../logger/structured-logger.js";

  describe("IntelAgent", () => {
    describe("generateSummary", () => {
      it("generates tactical summary with unit counts by coalition", async () => {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const agent = new IntelAgent(config, logger);
        
        const mockSnapshot: BfisContextSnapshot = {
          base: {
            snapshotId: "test-1",
            missionId: "test-mission",
            serverId: "test-server",
            sessionHash: "test-session",
            time: "2024-01-01T00:00:00Z",
            units: [
              { unitId: "u1", coalition: "BLUE", category: "Aircraft", position: { lat: 40, lon: -75, altMeters: 10000 } },
              { unitId: "u2", coalition: "RED", category: "GroundUnit", position: { lat: 41, lon: -76, altMeters: 0 } },
            ],
          },
          airbases: [],
          bullseyes: [],
          spots: [],
          drawings: [],
          logs: [],
          weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
          hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
        };
        
        const output = await agent.process(mockSnapshot, null);
        
        assert.strictEqual(output.summary.unitCounts.BLUE, 1);
        assert.strictEqual(output.summary.unitCounts.RED, 1);
        assert.strictEqual(output.summary.unitCounts.NEUTRAL, 0);
        assert.strictEqual(output.summary.unitCounts.UNKNOWN, 0);
      });
    });
  });
  ```

- [X] T009 [P] [US1] Create unit test for snapshot tools in `bfis-service/src/agents/__tests__/tools/snapshot-tools.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/tools/snapshot-tools.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { getCurrentSnapshotTool, getSnapshotSummaryTool } from "../../tools/snapshot-tools.js";

  describe("SnapshotTools", () => {
    describe("getCurrentSnapshotTool", () => {
      it("fetches snapshot from SnapshotReader", async () => {
        // Mock SnapshotReader.readContextOnce()
        const snapshot = await getCurrentSnapshotTool.invoke({});
        assert.ok(snapshot.base);
        assert.ok(snapshot.base.units);
      });
    });
  });
  ```

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement snapshot tools in `bfis-service/src/agents/tools/snapshot-tools.ts`

  **Code snippet to guide implementation:**
  ```typescript
  import { tool } from "@langchain/core/tools";
  import { z } from "zod";
  import { SnapshotReader } from "../../snapshot/snapshot-reader.js";
  import type { BfisContextSnapshot } from "../../context/types.js";
  import type { TacticalSummary } from "../types.js";

  /**
   * Tool: Get current battlefield snapshot from Olympus.
   * 
   * Wraps SnapshotReader.readContextOnce() for use by Intel agent.
   * 
   * @returns Complete BfisContextSnapshot with all context data
   */
  export const getCurrentSnapshotTool = tool(
    async () => {
      // TODO: Get SnapshotReader instance (injected via constructor or context)
      // const snapshot = await snapshotReader.readContextOnce();
      // return snapshot;
      throw new Error("Not implemented - requires SnapshotReader injection");
    },
    {
      name: "get_current_snapshot",
      description: "Fetches the current battlefield snapshot from Olympus, including units, airbases, bullseyes, spots, drawings, logs, and weapons state.",
      schema: z.object({}), // No parameters
    }
  );

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
      // TODO: Implement summary generation
      // 1. Count units by coalition (BLUE, RED, NEUTRAL, UNKNOWN)
      // 2. Count units by category (Aircraft, GroundUnit, etc.)
      // 3. Extract key positions (airbases, bullseyes, clusters using Turf.js)
      // 4. Generate threat assessments based on unit positions and types
      // 5. Return TacticalSummary object
      throw new Error("Not implemented");
    },
    {
      name: "get_snapshot_summary",
      description: "Generates a tactical summary from a battlefield snapshot, including unit counts, key positions, and threat assessment.",
      schema: z.object({
        snapshot: z.any(), // BfisContextSnapshot type
      }),
    }
  );
  ```

- [X] T011 [US1] Implement tactical summary generation logic in `bfis-service/src/agents/intel-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  import type { BfisContextSnapshot } from "../context/types.js";
  import type { TacticalSummary, IntelAgentOutput } from "./types.js";
  import type { BfisConfig } from "../config/config.js";
  import type { StructuredLogger } from "../logger/structured-logger.js";
  import { groupBy, countBy } from "lodash";
  import * as turf from "@turf/turf";
  import type { OlympusCoalition } from "../../../shared-schemas/index.js";

  /**
   * Intel agent: Observes and summarizes battlefield state.
   * 
   * Generates high-level tactical summaries from battlefield snapshots,
   * enabling efficient decision-making without processing every detail.
   */
  export class IntelAgent {
    constructor(
      private readonly config: BfisConfig,
      private readonly logger: StructuredLogger
    ) {}

    /**
     * Process battlefield snapshot and generate tactical summary.
     * 
     * @param currentSnapshot - Current battlefield state
     * @param previousSnapshot - Previous snapshot for change detection (null if first)
     * @returns Intel agent output with summary and optional changes
     */
    async process(
      currentSnapshot: BfisContextSnapshot,
      previousSnapshot: BfisContextSnapshot | null
    ): Promise<IntelAgentOutput> {
      const startTime = Date.now();
      
      try {
        // Generate tactical summary
        const summary = await this.generateSummary(currentSnapshot);
        
        // Log summary generation
        this.logger.info("bfis-intel-summary-generated", {
          snapshotId: summary.snapshotId,
          summary: {
            unitCounts: summary.unitCounts,
            categoryCounts: summary.categoryCounts,
            threatCount: summary.threats.length,
          },
          generationTimeMs: Date.now() - startTime,
        });
        
        return {
          summary,
          changes: previousSnapshot ? await this.detectChanges(currentSnapshot, previousSnapshot) : undefined,
          timestamp: new Date().toISOString(),
          rawSnapshot: currentSnapshot, // Optional, may be omitted to save tokens
        };
      } catch (error) {
        this.logger.error("bfis-intel-summary-error", {
          snapshotId: currentSnapshot.base.snapshotId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    /**
     * Generate tactical summary from snapshot.
     * 
     * @param snapshot - Battlefield snapshot
     * @returns Tactical summary
     */
    private async generateSummary(snapshot: BfisContextSnapshot): Promise<TacticalSummary> {
      // Count units by coalition
      const unitCounts: Record<OlympusCoalition, number> = {
        BLUE: 0,
        RED: 0,
        NEUTRAL: 0,
        UNKNOWN: 0,
      };
      
      snapshot.base.units.forEach(unit => {
        unitCounts[unit.coalition] = (unitCounts[unit.coalition] || 0) + 1;
      });
      
      // Count units by category
      const categoryCounts = countBy(snapshot.base.units, unit => unit.category);
      
      // Extract key positions (airbases, bullseyes)
      const keyPositions = [
        ...snapshot.airbases.map(ab => ({
          type: "airbase" as const,
          coalition: ab.coalition,
          position: ab.position ? { lat: ab.position.lat, lon: ab.position.lon, altMeters: ab.position.altMeters } : undefined,
          label: ab.name || ab.id,
        })),
        ...snapshot.bullseyes.map(be => ({
          type: "bullseye" as const,
          coalition: be.coalition,
          position: be.position ? { lat: be.position.lat, lon: be.position.lon } : undefined,
          label: be.id,
        })),
      ];
      
      // Generate threat assessments (simplified for MVP)
      const threats = this.assessThreats(snapshot);
      
      return {
        unitCounts,
        categoryCounts,
        keyPositions,
        threats,
        snapshotTime: snapshot.base.time,
        snapshotId: snapshot.base.snapshotId,
      };
    }

    /**
     * Assess threats from snapshot.
     * 
     * @param snapshot - Battlefield snapshot
     * @returns Array of threat assessments
     */
    private assessThreats(snapshot: BfisContextSnapshot): Array<{
      coalition: OlympusCoalition;
      description: string;
      severity: "low" | "medium" | "high";
    }> {
      const threats: Array<{ coalition: OlympusCoalition; description: string; severity: "low" | "medium" | "high" }> = [];
      
      // Count units by coalition to assess threat levels
      const coalitionCounts = countBy(snapshot.base.units, u => u.coalition);
      
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
      
      return threats;
    }

    /**
     * Detect changes between snapshots (placeholder for US2).
     * 
     * @param current - Current snapshot
     * @param previous - Previous snapshot
     * @returns Snapshot delta or null
     */
    private async detectChanges(
      current: BfisContextSnapshot,
      previous: BfisContextSnapshot
    ): Promise<SnapshotDelta | null> {
      // Placeholder - will be implemented in US2
      return null;
    }
  }
  ```

- [X] T012 [US1] Export snapshot tools from `bfis-service/src/agents/tools/index.ts`

  **Code snippet to guide implementation:**
  ```typescript
  export { getCurrentSnapshotTool, getSnapshotSummaryTool } from "./snapshot-tools.js";
  ```

- [X] T013 [US1] Add error handling and logging to Intel agent in `bfis-service/src/agents/intel-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  // Add to process() method error handling:
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    
    this.logger.error("bfis-intel-snapshot-error", {
      error: errorMessage,
      errorType,
      snapshotId: currentSnapshot?.base.snapshotId || "unknown",
    });
    
    // For recoverable errors, return partial summary
    // For fatal errors, throw to propagate to orchestrator
    if (errorType === "NetworkError" || errorType === "TimeoutError") {
      // Recoverable - return empty summary
      return {
        summary: this.createEmptySummary(),
        timestamp: new Date().toISOString(),
      };
    }
    
    throw error; // Fatal error
  }
  ```

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Intel agent can observe battlefield state and generate tactical summaries.

---

## Phase 4: User Story 2 - BFIS Detects Changes Between Battlefield Observations (Priority: P1)

**Goal**: BFIS detects meaningful changes between consecutive battlefield observations, identifying new units, destroyed units, units that moved significantly, and changes in hostility status.

**Independent Test**: Provide two consecutive battlefield snapshots and verify that BFIS correctly identifies new units, destroyed units, units that moved beyond a threshold distance, and changes in hostility status.

### Tests for User Story 2

- [X] T014 [P] [US2] Create unit test for change detection in `bfis-service/src/agents/__tests__/intel-agent.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/intel-agent.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  describe("IntelAgent", () => {
    describe("detectChanges", () => {
      it("identifies new units", async () => {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const agent = new IntelAgent(config, logger);
        
        const previous: BfisContextSnapshot = {
          base: {
            snapshotId: "prev-1",
            missionId: "test-mission",
            serverId: "test-server",
            sessionHash: "test-session",
            time: "2024-01-01T00:00:00Z",
            units: [{ unitId: "u1", coalition: "BLUE", category: "Aircraft", position: { lat: 40, lon: -75, altMeters: 10000 } }],
          },
          // ... other fields
        };
        
        const current: BfisContextSnapshot = {
          base: {
            snapshotId: "curr-1",
            missionId: "test-mission",
            serverId: "test-server",
            sessionHash: "test-session",
            time: "2024-01-01T00:01:00Z",
            units: [
              { unitId: "u1", coalition: "BLUE", category: "Aircraft", position: { lat: 40, lon: -75, altMeters: 10000 } },
              { unitId: "u2", coalition: "RED", category: "GroundUnit", position: { lat: 41, lon: -76, altMeters: 0 } },
            ],
          },
          // ... other fields
        };
        
        const output = await agent.process(current, previous);
        
        assert.ok(output.changes);
        assert.strictEqual(output.changes!.newUnits.length, 1);
        assert.strictEqual(output.changes!.newUnits[0].unitId, "u2");
      });
    });
  });
  ```

### Implementation for User Story 2

- [X] T015 [US2] Implement change detection logic in `bfis-service/src/agents/intel-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  import type { SnapshotDelta } from "./types.js";
  import * as turf from "@turf/turf";

  /**
   * Detect changes between two snapshots.
   * 
   * @param current - Current snapshot
   * @param previous - Previous snapshot
   * @returns Snapshot delta or null if no previous snapshot
   */
  private async detectChanges(
    current: BfisContextSnapshot,
    previous: BfisContextSnapshot
  ): Promise<SnapshotDelta | null> {
    const positionThreshold = this.config.agents?.intel.positionChangeThresholdMeters ?? 1000;
    
    // Build unit ID sets
    const currentUnitIds = new Set(current.base.units.map(u => u.unitId));
    const previousUnitIds = new Set(previous.base.units.map(u => u.unitId));
    
    // Find new units (in current but not in previous)
    const newUnits = current.base.units
      .filter(u => !previousUnitIds.has(u.unitId))
      .map(u => ({
        unitId: u.unitId,
        coalition: u.coalition,
        category: u.category,
      }));
    
    // Find destroyed units (in previous but not in current)
    const destroyedUnits = previous.base.units
      .filter(u => !currentUnitIds.has(u.unitId))
      .map(u => ({
        unitId: u.unitId,
        coalition: u.coalition,
      }));
    
    // Find moved units (common IDs with position changes > threshold)
    const previousUnitsMap = new Map(previous.base.units.map(u => [u.unitId, u]));
    const movedUnits = current.base.units
      .filter(u => {
        const prevUnit = previousUnitsMap.get(u.unitId);
        if (!prevUnit) return false;
        
        const distance = turf.distance(
          [prevUnit.position.lon, prevUnit.position.lat],
          [u.position.lon, u.position.lat],
          { units: "kilometers" }
        ) * 1000; // Convert to meters
        
        return distance > positionThreshold;
      })
      .map(u => {
        const prevUnit = previousUnitsMap.get(u.unitId)!;
        return {
          unitId: u.unitId,
          oldPosition: { lat: prevUnit.position.lat, lon: prevUnit.position.lon },
          newPosition: { lat: u.position.lat, lon: u.position.lon },
        };
      });
    
    // Detect hostility status change
    const hostilityChanged = 
      current.hostility.hostilitiesStarted !== previous.hostility.hostilitiesStarted;
    
    // Log changes if significant
    if (newUnits.length > 0 || destroyedUnits.length > 0 || movedUnits.length > 0 || hostilityChanged) {
      this.logger.info("bfis-intel-changes-detected", {
        snapshotId: current.base.snapshotId,
        previousSnapshotId: previous.base.snapshotId,
        changes: {
          newUnits: newUnits.length,
          destroyedUnits: destroyedUnits.length,
          movedUnits: movedUnits.length,
          hostilityChanged,
        },
      });
    }
    
    return {
      newUnits,
      destroyedUnits,
      movedUnits,
      hostilityChanged,
      previousSnapshotTime: previous.base.time,
      currentSnapshotTime: current.base.time,
    };
  }
  ```

- [X] T016 [US2] Add session hash change detection in `bfis-service/src/agents/intel-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  async process(
    currentSnapshot: BfisContextSnapshot,
    previousSnapshot: BfisContextSnapshot | null
  ): Promise<IntelAgentOutput> {
    // Detect session hash change (mission reset)
    if (previousSnapshot && 
        previousSnapshot.base.sessionHash !== currentSnapshot.base.sessionHash) {
      this.logger.info("bfis-intel-session-reset", {
        oldSessionHash: previousSnapshot.base.sessionHash,
        newSessionHash: currentSnapshot.base.sessionHash,
      });
      // Treat as first observation (no previous snapshot for change detection)
      previousSnapshot = null;
    }
    
    // ... rest of process() method
  }
  ```

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Intel agent can observe battlefield state, generate summaries, and detect changes.

---

## Phase 5: User Story 3 - BFIS Makes Decisions Based on Battlefield Intelligence (Priority: P1)

**Goal**: BFIS makes tactical decisions based on battlefield intelligence summaries, producing decisions containing one or more high-level actions with reasoning.

**Independent Test**: Provide tactical summaries and mission context, then verify that BFIS produces decisions containing valid actions with reasoning.

### Tests for User Story 3

- [X] T017 [P] [US3] Create unit test for Commander agent decision-making in `bfis-service/src/agents/__tests__/commander-agent.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/commander-agent.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { CommanderAgent } from "../commander-agent.js";
  import type { CommanderAgentInput, TacticalSummary, MissionContext } from "../types.js";
  import { loadConfig } from "../../config/config.js";
  import { createStructuredLogger } from "../../logger/structured-logger.js";

  describe("CommanderAgent", () => {
    describe("makeDecision", () => {
      it("produces decision with actions and reasoning", async () => {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const agent = new CommanderAgent(config, logger);
        
        const input: CommanderAgentInput = {
          intelSummary: {
            unitCounts: { BLUE: 5, RED: 10, NEUTRAL: 0, UNKNOWN: 0 },
            categoryCounts: { Aircraft: 15 },
            keyPositions: [],
            threats: [{ coalition: "RED", description: "RED has more units", severity: "high" }],
            snapshotTime: "2024-01-01T00:00:00Z",
            snapshotId: "test-1",
          },
          missionContext: {
            missionId: "test-mission",
            serverId: "test-server",
            sessionHash: "test-session",
            time: "2024-01-01T00:00:00Z",
            hostilitiesStarted: true,
          },
        };
        
        const decision = await agent.makeDecision(input);
        
        assert.ok(decision.decisionId);
        assert.ok(decision.actions.length > 0);
        assert.ok(decision.reasoningNotes);
        assert.ok(decision.actions.length <= 10); // Max actions per decision
      });

      it("falls back to rules-based on LLM failure", async () => {
        // Mock LLM client to throw error
        // Verify fallback produces conservative defensive actions
      });
    });
  });
  ```

### Implementation for User Story 3

- [X] T018 [US3] Implement Commander agent in `bfis-service/src/agents/commander-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  import type { CommanderAgentInput, BfisDecision } from "./types.js";
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
        
        // Log decision
        this.logger.info("bfis-commander-decision-made", {
          decisionId: decision.decisionId,
          snapshotId: input.intelSummary.snapshotId,
          actionCount: decision.actions.length,
          actionTypes: decision.actions.map(a => a.type),
          reasoningLength: decision.reasoningNotes.length,
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
      
      const response = await this.llmClient.invoke(prompt, {
        temperature: this.config.agents?.commander.temperature ?? 0.7,
        maxTokens: this.config.agents?.commander.maxTokens ?? 4000,
      });
      
      // Parse LLM response as JSON
      try {
        const decision = JSON.parse(response.content) as BfisDecision;
        decision.decisionId = decision.decisionId || uuidv4();
        decision.timestamp = decision.timestamp || new Date().toISOString();
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
      return `You are a tactical commander analyzing battlefield intelligence.

Mission Context:
- Mission ID: ${input.missionContext.missionId}
- Hostilities Started: ${input.missionContext.hostilitiesStarted}
- Current Time: ${input.missionContext.time}

Battlefield Summary:
- Unit Counts: ${JSON.stringify(input.intelSummary.unitCounts)}
- Category Counts: ${JSON.stringify(input.intelSummary.categoryCounts)}
- Key Positions: ${input.intelSummary.keyPositions.length}
- Threats: ${input.intelSummary.threats.map(t => `${t.coalition} (${t.severity}): ${t.description}`).join(", ")}

${input.changes ? `Recent Changes:\n${JSON.stringify(input.changes, null, 2)}` : ""}

${input.previousDecision ? `Previous Decision: ${JSON.stringify(input.previousDecision, null, 2)}` : ""}

${input.playerIntent ? `Player Intent: ${input.playerIntent}` : ""}

Constraints:
- Maximum ${this.maxActionsPerDecision} actions per decision
- ${input.missionContext.hostilitiesStarted ? "Hostilities have started - attacks allowed" : "Hostilities NOT started - NO attacks allowed, only spawn/move actions"}
- Actions must be valid BfisAction types: SPAWN, MOVE, ATTACK, etc.

Generate a tactical decision as JSON with this structure:
{
  "decisionId": "uuid",
  "actions": [
    {
      "type": "SPAWN",
      "target": { ... },
      "params": { ... }
    }
  ],
  "reasoningNotes": "Explanation of why these actions were chosen",
  "timestamp": "ISO 8601"
}`;
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
  ```

- [X] T019 [US3] Implement LLM client for Ollama in `bfis-service/src/intent/llm-client.ts`

  **Note**: MVP supports Ollama and LLMstudio. LLMstudio implementation follows same pattern as Ollama but uses different API endpoint. For MVP, prioritize Ollama; LLMstudio can be added as extension if needed.
  
  **Code snippet to guide implementation:**
  ```typescript
  /**
   * Ollama LLM client implementation.
   */
  class OllamaClient implements LLMClient {
    constructor(
      private readonly baseUrl: string,
      private readonly model: string
    ) {}

    async invoke(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens,
          stop: options?.stopSequences,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        content: data.response,
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    }

    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
        return response.ok;
      } catch {
        return false;
      }
    }
  }

  /**
   * Create LLM client based on configuration.
   */
  export function createLLMClient(config: BfisConfig): LLMClient {
    if (config.llm.provider === "none" || !config.llm.baseUrl || !config.llm.model) {
      // Return no-op client that throws on invoke
      return {
        async invoke() { throw new Error("LLM not configured"); },
        async isAvailable() { return false; },
      };
    }
    
    if (config.llm.provider === "ollama") {
      return new OllamaClient(config.llm.baseUrl, config.llm.model);
    }
    
    if (config.llm.provider === "llmstudio") {
      // Similar implementation for LLMstudio
      // return new LLMStudioClient(config.llm.baseUrl, config.llm.model);
    }
    
    throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
  }
  ```

- [ ] T020 [US3] Add hostility status constraint validation in `bfis-service/src/agents/commander-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  private validateDecision(decision: BfisDecision, missionContext: MissionContext): void {
    // ... existing validation ...
    
    // Validate hostility constraints
    if (!missionContext.hostilitiesStarted) {
      const hasAttackActions = decision.actions.some(a => a.type === "ATTACK");
      if (hasAttackActions) {
        throw new Error("Cannot produce ATTACK actions before hostilities begin");
      }
    }
  }
  ```

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently. Commander agent can make tactical decisions based on Intel summaries.

---

## Phase 6: User Story 4 - BFIS Translates Decisions into Executable Commands (Priority: P1)

**Goal**: BFIS translates high-level decisions into concrete Olympus command formats and executes or logs them based on configuration.

**Independent Test**: Provide decisions with various action types and verify that BFIS correctly maps each action to the appropriate Olympus command format.

### Tests for User Story 4

- [X] T021 [P] [US4] Create unit test for Writer agent command translation in `bfis-service/src/agents/__tests__/writer-agent.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/writer-agent.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { WriterAgent } from "../writer-agent.js";
  import type { WriterAgentInput, BfisDecision } from "../types.js";
  import { loadConfig } from "../../config/config.js";
  import { createStructuredLogger } from "../../logger/structured-logger.js";

  describe("WriterAgent", () => {
    describe("executeCommands", () => {
      it("maps SPAWN action to spawnAircrafts command", async () => {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const agent = new WriterAgent(config, logger);
        
        const decision: BfisDecision = {
          decisionId: "test-decision-1",
          actions: [{
            type: "SPAWN",
            target: { coordinateRef: { lat: 40.0, lon: -75.0 } },
            params: { unitType: "F-16C_50", count: 2 },
          }],
          reasoningNotes: "Test decision",
          timestamp: "2024-01-01T00:00:00Z",
        };
        
        const input: WriterAgentInput = {
          decision,
          availableCommands: ["spawnAircrafts", "spawnHelicopters", "setPath", "attackUnit"],
        };
        
        const results = await agent.executeCommands(input);
        
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].commandHash);
        // In logging mode, status should be "LOGGED"
        // In execution mode, status should be "PENDING" or "SENT"
      });
    });
  });
  ```

### Implementation for User Story 4

- [X] T022 [US4] Implement Writer agent in `bfis-service/src/agents/writer-agent.ts`

  **Integration Note**: Writer agent maps BfisAction to Olympus command formats. For MVP, commands are logged or executed via direct HTTP calls to Olympus API endpoints. Future enhancement: integrate with existing CommandAdapter layer if available in `bfis-service/src/command/` or similar directory. Check for existing command execution utilities before implementing new HTTP client.
  
  **Code snippet to guide implementation:**
  ```typescript
  import type { WriterAgentInput, CommandResult } from "./types.js";
  import type { BfisConfig } from "../config/config.js";
  import type { StructuredLogger } from "../logger/structured-logger.js";
  import type { BfisAction } from "../../../shared-schemas/index.js";
  import { v4 as uuidv4 } from "uuid";

  /**
   * Writer agent: Translates decisions into executable Olympus commands.
   * 
   * Maps high-level BfisAction types to concrete Olympus command formats,
   * validates parameters, and executes or logs commands based on configuration.
   */
  export class WriterAgent {
    private readonly executionMode: "log" | "execute";
    private readonly enableValidation: boolean;

    constructor(
      private readonly config: BfisConfig,
      private readonly logger: StructuredLogger
    ) {
      this.executionMode = config.agents?.writer.commandExecutionMode ?? "log";
      this.enableValidation = config.agents?.writer.enableCommandValidation ?? true;
    }

    /**
     * Translate decision actions into Olympus commands and execute or log them.
     * 
     * @param input - Writer agent input (decision + available commands)
     * @returns Array of command results, one per action
     */
    async executeCommands(input: WriterAgentInput): Promise<CommandResult[]> {
      const results: CommandResult[] = [];
      
      for (let i = 0; i < input.decision.actions.length; i++) {
        const action = input.decision.actions[i];
        
        try {
          // Map action to command
          const command = this.mapActionToCommand(action, input.availableCommands);
          
          if (!command) {
            this.logger.warn("bfis-writer-unknown-action", {
              decisionId: input.decision.decisionId,
              actionIndex: i,
              actionType: action.type,
            });
            continue; // Skip unknown actions
          }
          
          // Validate command parameters
          if (this.enableValidation) {
            const validationError = this.validateCommand(command, action);
            if (validationError) {
              this.logger.error("bfis-writer-validation-error", {
                decisionId: input.decision.decisionId,
                actionIndex: i,
                actionType: action.type,
                error: validationError,
              });
              results.push({
                commandHash: uuidv4(),
                status: "FAILED",
                error: validationError,
              });
              continue;
            }
          }
          
          // Execute or log command
          const result = await this.executeOrLogCommand(command, action);
          results.push(result);
          
          this.logger.info("bfis-writer-command-mapped", {
            decisionId: input.decision.decisionId,
            actionIndex: i,
            actionType: action.type,
            commandName: command.name,
            commandHash: result.commandHash,
          });
        } catch (error) {
          this.logger.error("bfis-writer-command-error", {
            decisionId: input.decision.decisionId,
            actionIndex: i,
            actionType: action.type,
            error: error instanceof Error ? error.message : String(error),
          });
          
          results.push({
            commandHash: uuidv4(),
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      return results;
    }

    /**
     * Map BfisAction to Olympus command format.
     * 
     * @param action - BFIS action to map
     * @param availableCommands - List of available command names
     * @returns Command object or null if action type unknown
     */
    private mapActionToCommand(
      action: BfisAction,
      availableCommands: string[]
    ): { name: string; params: Record<string, unknown> } | null {
      switch (action.type) {
        case "SPAWN":
          // Determine spawn command based on unit category
          if (action.params?.category === "Helicopter") {
            return { name: "spawnHelicopters", params: this.buildSpawnParams(action) };
          }
          return { name: "spawnAircrafts", params: this.buildSpawnParams(action) };
        
        case "MOVE":
          if (action.params?.destinationType === "airbase") {
            return { name: "landAt", params: this.buildMoveParams(action) };
          }
          return { name: "setPath", params: this.buildMoveParams(action) };
        
        case "ATTACK":
          if (action.target?.unitId) {
            return { name: "attackUnit", params: this.buildAttackParams(action) };
          }
          return { name: "bombPoint", params: this.buildAttackParams(action) };
        
        default:
          return null; // Unknown action type
      }
    }

    /**
     * Build spawn command parameters from action.
     */
    private buildSpawnParams(action: BfisAction): Record<string, unknown> {
      return {
        unitType: action.params?.unitType,
        count: action.params?.count ?? 1,
        position: action.target?.coordinateRef,
        coalition: action.params?.coalition,
        // ... other spawn parameters
      };
    }

    /**
     * Build move command parameters from action.
     */
    private buildMoveParams(action: BfisAction): Record<string, unknown> {
      return {
        unitId: action.target?.unitId,
        path: action.params?.path,
        destination: action.target?.coordinateRef,
        // ... other move parameters
      };
    }

    /**
     * Build attack command parameters from action.
     */
    private buildAttackParams(action: BfisAction): Record<string, unknown> {
      return {
        unitId: action.target?.unitId,
        target: action.target?.coordinateRef,
        weaponType: action.params?.weaponType,
        // ... other attack parameters
      };
    }

    /**
     * Validate command parameters.
     * 
     * @param command - Command to validate
     * @param action - Original action
     * @returns Error message if invalid, null if valid
     */
    private validateCommand(
      command: { name: string; params: Record<string, unknown> },
      action: BfisAction
    ): string | null {
      // Validate required parameters based on command type
      if (command.name === "spawnAircrafts" || command.name === "spawnHelicopters") {
        if (!command.params.unitType) {
          return "Spawn command requires unitType";
        }
        if (!command.params.position) {
          return "Spawn command requires position";
        }
      }
      
      // ... other validation rules
      
      return null; // Valid
    }

    /**
     * Execute or log command based on execution mode.
     * 
     * @param command - Command to execute/log
     * @param action - Original action
     * @returns Command result
     */
    private async executeOrLogCommand(
      command: { name: string; params: Record<string, unknown> },
      action: BfisAction
    ): Promise<CommandResult> {
      const commandHash = uuidv4();
      
      if (this.executionMode === "log") {
        // Log command without executing
        this.logger.info("bfis-writer-command-logged", {
          commandHash,
          commandName: command.name,
          params: command.params,
        });
        
        return {
          commandHash,
          status: "LOGGED", // Custom status for logging mode
        };
      }
      
      // Execution mode: Send command to Olympus (future implementation)
      // For MVP, this is a placeholder
      // TODO: Implement Command Adapter integration
      return {
        commandHash,
        status: "PENDING",
      };
    }
  }
  ```

- [ ] T023 [US4] Implement command retry logic in `bfis-service/src/agents/writer-agent.ts`

  **Code snippet to guide implementation:**
  ```typescript
  /**
   * Execute command with retry logic.
   * 
   * Retries once (2 total attempts) on failure, then logs and continues.
   * 
   * @param command - Command to execute
   * @param action - Original action
   * @returns Command result
   */
  private async executeCommandWithRetry(
    command: { name: string; params: Record<string, unknown> },
    action: BfisAction
  ): Promise<CommandResult> {
    const commandHash = uuidv4();
    let lastError: Error | null = null;
    
    // Initial attempt + one retry = 2 total attempts
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Execute command (placeholder for Command Adapter)
        // const result = await this.commandAdapter.execute(command);
        // return { commandHash, status: result.status };
        
        // For MVP logging mode, just return success
        return { commandHash, status: "LOGGED" };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === 0) {
          // Retry once
          continue;
        }
      }
    }
    
    // Both attempts failed
    this.logger.error("bfis-writer-command-retry-failed", {
      commandHash,
      commandName: command.name,
      error: lastError?.message,
    });
    
    return {
      commandHash,
      status: "FAILED",
      error: lastError?.message,
    };
  }
  ```

**Checkpoint**: At this point, User Stories 1, 2, 3, AND 4 should all work independently. Writer agent can translate decisions into commands and log/execute them.

---

## Phase 7: User Story 5 - BFIS Orchestrates Multi-Agent Decision Cycles (Priority: P2)

**Goal**: BFIS coordinates the three specialized agents (Intel, Commander, Writer) to complete full decision cycles from snapshot to command execution.

**Independent Test**: Run a complete decision cycle and verify that Intel agent output flows to Commander, Commander output flows to Writer, and final commands are produced.

### Tests for User Story 5

- [ ] T024 [P] [US5] Create integration test for orchestrator in `bfis-service/src/agents/__tests__/orchestrator.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/orchestrator.test.ts
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { Orchestrator } from "../orchestrator.js";
  import type { AgentState } from "../types.js";
  import type { BfisContextSnapshot } from "../../context/types.js";
  import { loadConfig } from "../../config/config.js";
  import { createStructuredLogger } from "../../logger/structured-logger.js";
  import { v4 as uuidv4 } from "uuid";

  describe("Orchestrator", () => {
    describe("runCycle", () => {
      it("runs full cycle from snapshot to commands", async () => {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const orchestrator = new Orchestrator(config, logger);
        
        const mockSnapshot: BfisContextSnapshot = {
          // ... mock snapshot data
        };
        
        const initialState: AgentState = {
          currentSnapshot: mockSnapshot,
          previousSnapshot: null,
          intelOutput: null,
          commanderInput: null,
          decision: null,
          writerInput: null,
          commandResults: null,
          error: null,
          cycleId: uuidv4(),
          cycleStartTime: new Date().toISOString(),
          cycleEndTime: null,
        };
        
        const finalState = await orchestrator.runCycle(initialState);
        
        assert.ok(finalState.intelOutput);
        assert.ok(finalState.decision);
        assert.ok(finalState.commandResults);
        assert.ok(finalState.cycleEndTime);
      });

      it("processes cycles sequentially (one completes before next starts)", async () => {
        // Per FR-016: Sequential cycles only
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const orchestrator = new Orchestrator(config, logger);
        
        let cycle1Complete = false;
        let cycle2Started = false;
        
        const cycle1Promise = orchestrator.runCycle(initialState).then(() => {
          cycle1Complete = true;
        });
        
        // Attempt to start cycle 2 immediately (should wait for cycle 1)
        const cycle2Promise = Promise.resolve().then(async () => {
          cycle2Started = true;
          // If sequential, cycle2Started should be true only after cycle1Complete
          return orchestrator.runCycle(initialState2);
        });
        
        await Promise.all([cycle1Promise, cycle2Promise]);
        
        // Verify sequential processing: cycle 2 should not start until cycle 1 completes
        // This test validates FR-016 requirement
        assert.ok(cycle1Complete || !cycle2Started, "Cycle 2 started before cycle 1 completed");
      });
    });
  });
  ```

### Implementation for User Story 5

- [ ] T025 [US5] Implement LangGraph state machine in `bfis-service/src/agents/orchestrator.ts`

  **Important**: AgentState is immutable per types.ts. LangGraph nodes must return new state objects, not mutate existing state. Use spread operator or Object.assign to create new state snapshots.
  
  **Code snippet to guide implementation:**
  ```typescript
  import { StateGraph, END } from "@langchain/langgraph";
  import type { AgentState } from "./types.js";
  import type { BfisConfig } from "../config/config.js";
  import type { StructuredLogger } from "../logger/structured-logger.js";
  import { IntelAgent } from "./intel-agent.js";
  import { CommanderAgent } from "./commander-agent.js";
  import { WriterAgent } from "./writer-agent.js";
  import { v4 as uuidv4 } from "uuid";

  /**
   * Orchestrator: Coordinates three agents to complete full decision cycles.
   * 
   * Uses LangGraph state machine to manage agent flow and error handling.
   * Processes cycles sequentially (one completes before next starts).
   */
  export class Orchestrator {
    private readonly workflow: ReturnType<typeof this.buildWorkflow>;
    private previousSnapshotCache: Map<string, any> = new Map(); // Key: sessionHash

    constructor(
      private readonly config: BfisConfig,
      private readonly logger: StructuredLogger
    ) {
      this.workflow = this.buildWorkflow();
    }

    /**
     * Run a complete decision cycle from snapshot to command execution.
     * 
     * @param initialState - Initial agent state with current snapshot
     * @returns Final agent state after cycle completion
     */
    async runCycle(initialState: AgentState): Promise<AgentState> {
      this.logger.info("bfis-orchestrator-cycle-started", {
        cycleId: initialState.cycleId,
        snapshotId: initialState.currentSnapshot?.base.snapshotId || "unknown",
        sessionHash: initialState.currentSnapshot?.base.sessionHash || "unknown",
      });
      
      try {
        // Check for session hash change and clear cache
        if (initialState.currentSnapshot) {
          const sessionHash = initialState.currentSnapshot.base.sessionHash;
          const cached = this.previousSnapshotCache.get(sessionHash);
          
          if (cached && cached.sessionHash !== sessionHash) {
            // Session changed - clear cache
            this.previousSnapshotCache.clear();
            this.logger.info("bfis-orchestrator-session-reset", {
              oldSessionHash: cached.sessionHash,
              newSessionHash: sessionHash,
              clearedCacheSize: this.previousSnapshotCache.size,
            });
          }
          
          // Set previous snapshot from cache
          initialState.previousSnapshot = cached || null;
        }
        
        // Run LangGraph workflow
        const finalState = await this.workflow.invoke(initialState);
        
        // Cache current snapshot as previous for next cycle
        if (finalState.currentSnapshot) {
          const sessionHash = finalState.currentSnapshot.base.sessionHash;
          this.previousSnapshotCache.set(sessionHash, finalState.currentSnapshot);
        }
        
        // Log cycle completion
        const cycleDuration = finalState.cycleEndTime && finalState.cycleStartTime
          ? new Date(finalState.cycleEndTime).getTime() - new Date(finalState.cycleStartTime).getTime()
          : 0;
        
        this.logger.info("bfis-orchestrator-cycle-completed", {
          cycleId: finalState.cycleId,
          snapshotId: finalState.currentSnapshot?.base.snapshotId || "unknown",
          decisionId: finalState.decision?.decisionId || null,
          commandCount: finalState.commandResults?.length || 0,
          cycleDurationMs: cycleDuration,
          error: finalState.error !== null,
        });
        
        return finalState;
      } catch (error) {
        this.logger.error("bfis-orchestrator-cycle-error", {
          cycleId: initialState.cycleId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    /**
     * Build LangGraph workflow with nodes and edges.
     * 
     * @returns Compiled workflow
     */
    private buildWorkflow() {
      const workflow = new StateGraph<AgentState>({
        channels: {
          currentSnapshot: null,
          previousSnapshot: null,
          intelOutput: null,
          commanderInput: null,
          decision: null,
          writerInput: null,
          commandResults: null,
          error: null,
          cycleId: "",
          cycleStartTime: "",
          cycleEndTime: null,
        },
      });
      
      // Add nodes
      workflow.addNode("intel", this.intelNode.bind(this));
      workflow.addNode("commander", this.commanderNode.bind(this));
      workflow.addNode("writer", this.writerNode.bind(this));
      workflow.addNode("checkError", this.checkErrorNode.bind(this));
      
      // Add edges
      workflow.setEntryPoint("intel");
      workflow.addEdge("intel", "checkError");
      workflow.addConditionalEdges("checkError", this.routeAfterError.bind(this));
      workflow.addEdge("commander", "checkError");
      workflow.addEdge("writer", "checkError");
      workflow.addEdge("checkError", END);
      
      return workflow.compile();
    }

    /**
     * Intel node: Process snapshot and generate summary.
     */
    private async intelNode(state: AgentState): Promise<Partial<AgentState>> {
      if (!state.currentSnapshot) {
        return {
          error: {
            agent: "intel",
            message: "No current snapshot provided",
            timestamp: new Date().toISOString(),
            recoverable: false,
          },
        };
      }
      
      const intelAgent = new IntelAgent(this.config, this.logger);
      const intelOutput = await intelAgent.process(
        state.currentSnapshot,
        state.previousSnapshot
      );
      
      return {
        intelOutput,
        previousSnapshot: state.currentSnapshot, // Cache for next cycle
      };
    }

    /**
     * Commander node: Make decision from Intel output.
     */
    private async commanderNode(state: AgentState): Promise<Partial<AgentState>> {
      if (!state.intelOutput || !state.currentSnapshot) {
        return {
          error: {
            agent: "commander",
            message: "No Intel output or snapshot available",
            timestamp: new Date().toISOString(),
            recoverable: false,
          },
        };
      }
      
      const commanderAgent = new CommanderAgent(this.config, this.logger);
      const commanderInput = this.buildCommanderInput(state);
      const decision = await commanderAgent.makeDecision(commanderInput);
      
      return {
        decision,
        commanderInput,
      };
    }

    /**
     * Writer node: Translate decision to commands.
     */
    private async writerNode(state: AgentState): Promise<Partial<AgentState>> {
      if (!state.decision) {
        return {
          error: {
            agent: "writer",
            message: "No decision available",
            timestamp: new Date().toISOString(),
            recoverable: false,
          },
        };
      }
      
      const writerAgent = new WriterAgent(this.config, this.logger);
      const writerInput = this.buildWriterInput(state);
      const commandResults = await writerAgent.executeCommands(writerInput);
      
      return {
        commandResults,
        writerInput,
        cycleEndTime: new Date().toISOString(),
      };
    }

    /**
     * Check error node: Determine if cycle should continue or abort.
     */
    private async checkErrorNode(state: AgentState): Promise<Partial<AgentState>> {
      if (state.error && !state.error.recoverable) {
        // Fatal error - abort cycle
        return {
          cycleEndTime: new Date().toISOString(),
        };
      }
      // Recoverable error or no error - continue
      return {};
    }

    /**
     * Route after error check.
     */
    private routeAfterError(state: AgentState): string {
      if (state.error && !state.error.recoverable) {
        return END; // Fatal error
      }
      
      // Route to next agent
      if (!state.intelOutput) return "commander";
      if (!state.decision) return "writer";
      return END; // Cycle complete
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
          "landAt",
          "attackUnit",
          "bombPoint",
        ],
      };
    }
  }
  ```

- [ ] T026 [US5] Integrate orchestrator with polling loop in `bfis-service/src/runtime/polling-loop.ts`

  **Verification**: Before implementing, verify that `bfis-service/src/runtime/polling-loop.ts` exists. If it doesn't exist, check for similar polling mechanism in `bfis-service/src/` or create new file following existing BFIS patterns.
  
  **Code snippet to guide implementation:**
  ```typescript
  import { Orchestrator } from "../agents/orchestrator.js";
  import { v4 as uuidv4 } from "uuid";
  import type { AgentState } from "../agents/types.js";

  // Add to PollingLoop class:
  private orchestrator: Orchestrator | null = null;
  private previousSnapshot: BfisContextSnapshot | null = null;

  // In constructor or initialization:
  this.orchestrator = new Orchestrator(this.config, this.logger);

  // Update pollOnce() method:
  private async pollOnce(): Promise<void> {
    try {
      const snapshot: BfisContextSnapshot = await this.snapshotReader.readContextOnce();

      // Check for session hash change
      if (this.lastSessionHash !== null && snapshot.base.sessionHash !== this.lastSessionHash) {
        this.logger.info("bfis-session-reset", {
          previousSessionHash: this.lastSessionHash,
          newSessionHash: snapshot.base.sessionHash,
          snapshotId: snapshot.base.snapshotId,
        });
        this.previousSnapshot = null; // Clear cache on session change
      }

      this.lastSessionHash = snapshot.base.sessionHash;

      // Run orchestrator cycle
      if (this.orchestrator) {
        const initialState: AgentState = {
          currentSnapshot: snapshot,
          previousSnapshot: this.previousSnapshot,
          intelOutput: null,
          commanderInput: null,
          decision: null,
          writerInput: null,
          commandResults: null,
          error: null,
          cycleId: uuidv4(),
          cycleStartTime: new Date().toISOString(),
          cycleEndTime: null,
        };

        const finalState = await this.orchestrator.runCycle(initialState);
        
        // Cache snapshot for next cycle
        this.previousSnapshot = snapshot;
      }

    } catch (err) {
      // ... existing error handling
    }
  }
  ```

- [ ] T027 [US5] Add cycle timeout handling in `bfis-service/src/agents/orchestrator.ts`

  **Code snippet to guide implementation:**
  ```typescript
  async runCycle(initialState: AgentState): Promise<AgentState> {
    const timeoutMs = this.config.agents?.orchestrator.cycleTimeoutMs ?? 30000;
    
    // Wrap workflow execution in timeout
    const timeoutPromise = new Promise<AgentState>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Cycle timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    try {
      const finalState = await Promise.race([
        this.executeCycle(initialState),
        timeoutPromise,
      ]);
      return finalState;
    } catch (error) {
      if (error instanceof Error && error.message.includes("timeout")) {
        this.logger.error("bfis-orchestrator-cycle-timeout", {
          cycleId: initialState.cycleId,
          timeoutMs,
        });
      }
      throw error;
    }
  }

  private async executeCycle(initialState: AgentState): Promise<AgentState> {
    // ... existing runCycle logic without timeout wrapper
  }
  ```

- [ ] T027A [US5] Integrate NDJSON decision logging in `bfis-service/src/agents/orchestrator.ts`

  **Purpose**: Per FR-012 and constitution, all decision cycles MUST be logged to NDJSON for traceability. This task integrates createNdjsonLogger() into orchestrator.runCycle().
  
  **Code snippet to guide implementation:**
  ```typescript
  import { createNdjsonLogger } from "../logger/ndjson-logger.js";
  
  // In Orchestrator constructor:
  private readonly ndjsonLogger: ReturnType<typeof createNdjsonLogger>;
  
  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger
  ) {
    // ... existing initialization ...
    this.ndjsonLogger = createNdjsonLogger(config.decisionLogPath || "logs/decisions.ndjson");
  }
  
  // In runCycle(), after cycle completes:
  async runCycle(initialState: AgentState): Promise<AgentState> {
    // ... existing cycle logic ...
    
    // Log decision cycle to NDJSON (per FR-012)
    await this.ndjsonLogger.log({
      ts: finalState.cycleEndTime || new Date().toISOString(),
      cycleId: finalState.cycleId,
      decisionId: finalState.decision?.decisionId || null,
      snapshotId: finalState.currentSnapshot?.base.snapshotId || null,
      sessionHash: finalState.currentSnapshot?.base.sessionHash || null,
      actions: finalState.decision?.actions.map(a => ({
        type: a.type,
        target: a.target,
        // Include summary, not full params to save space
      })) || [],
      commandResults: finalState.commandResults?.map(r => ({
        commandHash: r.commandHash,
        status: r.status,
        error: r.error || null,
      })) || [],
      cycleDurationMs: cycleDuration,
      error: finalState.error ? {
        agent: finalState.error.agent,
        message: finalState.error.message,
        recoverable: finalState.error.recoverable,
      } : null,
    });
    
    return finalState;
  }
  ```

**Checkpoint**: At this point, all user stories should work together. Full decision cycles can run from snapshot observation through command execution, with complete NDJSON logging for traceability.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T028 [P] Add comprehensive JSDoc comments to all agent classes in `bfis-service/src/agents/`

  **Scope**: Per constitution VIII, ALL public APIs, classes, functions, and types MUST have JSDoc. This includes:
  - All exported classes: IntelAgent, CommanderAgent, WriterAgent, Orchestrator
  - All public methods in each class
  - All exported functions in tools/
  - All exported interfaces/types in types.ts (verify completeness)
  - All exported configuration functions
  
  **Code snippet to guide implementation:**
  ```typescript
  /**
   * Intel agent: Observes and summarizes battlefield state.
   * 
   * Generates high-level tactical summaries from battlefield snapshots,
   * enabling efficient decision-making without processing every detail.
   * 
   * Per spec-004: Intel agent = Snapshot Summarizer + Change Detector
   * - Consumes BfisContextSnapshot from decoders
   * - Generates tactical summaries (unit counts, positions, threats)
   * - Detects changes between snapshots
   * 
   * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/architecture/spec-004.md | spec-004.md}
   */
  export class IntelAgent {
    // ... implementation
  }
  ```

- [ ] T029 [P] Add error recovery tests for all agents in `bfis-service/src/agents/__tests__/`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/
  ```
  
  **Code snippet to guide implementation:**
  ```typescript
  // Add to each agent test file:
  describe("Error Handling", () => {
    it("handles recoverable errors gracefully", async () => {
      // Test recoverable error scenarios
    });
    
    it("propagates fatal errors correctly", async () => {
      // Test fatal error scenarios
    });
  });
  ```

- [ ] T030 [P] Add performance monitoring and logging in `bfis-service/src/agents/orchestrator.ts`

  **Code snippet to guide implementation:**
  ```typescript
  // Add timing measurements:
  const intelStartTime = Date.now();
  const intelOutput = await intelAgent.process(...);
  const intelDuration = Date.now() - intelStartTime;
  
  this.logger.info("bfis-orchestrator-agent-timing", {
    cycleId: state.cycleId,
    agent: "intel",
    durationMs: intelDuration,
  });
  ```

- [ ] T031 [P] Validate all agent outputs match type definitions in `bfis-service/src/agents/`

  **Validation Approach**: Use TypeScript compile-time type checking as primary validation (types.ts is source of truth). Add runtime validation with zod ONLY for:
  - LLM-generated outputs (Commander agent decisions) - validate JSON parsing
  - External API responses (snapshot data) - validate structure before processing
  - Test fixtures - ensure mock data matches types
  
  **Code snippet to guide implementation:**
  ```typescript
  // Runtime validation for LLM outputs (Commander agent):
  import { z } from "zod";
  
  const BfisDecisionSchema = z.object({
    decisionId: z.string().uuid(),
    actions: z.array(z.object({
      type: z.enum(["SPAWN", "MOVE", "ATTACK", /* ... */]),
      target: z.any().optional(),
      params: z.record(z.any()).optional(),
    })),
    reasoningNotes: z.string().min(1),
    timestamp: z.string().datetime(),
  });
  
  // Validate LLM response before returning:
  const validated = BfisDecisionSchema.parse(parsedDecision);
  
  // TypeScript types (types.ts) provide compile-time safety for all other agent outputs
  ```

- [ ] T032 Run quickstart.md validation and update if needed in `specs/004-bfis-llm-architecture/quickstart.md`

- [ ] T033 [P] Add performance test to validate SC-001 (cycle duration <5s for 95% of cycles) in `bfis-service/src/agents/__tests__/orchestrator-performance.test.ts`

  **CRITICAL: ALL tests MUST run in Docker container (per constitution).**
  
  **Docker test command:**
  ```bash
  docker exec bfis npm test -- bfis-service/src/agents/__tests__/orchestrator-performance.test.ts
  ```
  
  **Purpose**: Validate SC-001 requirement that 95% of decision cycles complete in under 5 seconds.
  
  **Code snippet to guide implementation:**
  ```typescript
  import { test, describe } from "node:test";
  import assert from "node:assert/strict";
  import { Orchestrator } from "../orchestrator.js";
  import type { AgentState } from "../types.js";
  import { loadConfig } from "../../config/config.js";
  import { createStructuredLogger } from "../../logger/structured-logger.js";
  
  describe("Orchestrator Performance", () => {
    it("completes 95% of cycles in under 5 seconds", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);
      
      const cycleDurations: number[] = [];
      const cycleCount = 100; // Run 100 cycles for statistical significance
      
      for (let i = 0; i < cycleCount; i++) {
        const initialState: AgentState = {
          // ... mock state ...
        };
        
        const startTime = Date.now();
        await orchestrator.runCycle(initialState);
        const duration = Date.now() - startTime;
        cycleDurations.push(duration);
      }
      
      // Calculate 95th percentile
      cycleDurations.sort((a, b) => a - b);
      const p95Index = Math.floor(cycleCount * 0.95);
      const p95Duration = cycleDurations[p95Index];
      
      // SC-001: 95% of cycles must complete in <5s
      assert.ok(p95Duration < 5000, `95th percentile cycle duration (${p95Duration}ms) exceeds 5s threshold`);
    });
  });
  ```

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (P1 → P2)
  - US1 and US2 can be worked on in parallel after Foundational
  - US3 depends on US1 (needs Intel output)
  - US4 depends on US3 (needs Commander decision)
  - US5 depends on US1, US3, US4 (needs all agents)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Depends on US1 (uses Intel agent)
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - Depends on US1 (needs Intel output)
- **User Story 4 (P1)**: Can start after Foundational (Phase 2) - Depends on US3 (needs Commander decision)
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) - Depends on US1, US3, US4 (needs all agents)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Tools/utilities before agent implementation
- Core agent logic before integration
- Error handling after core logic
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- US1 and US2 can be worked on in parallel (US2 extends US1 but can be tested independently)
- All tests for a user story marked [P] can run in parallel
- Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: T008 [P] [US1] Create unit test for Intel agent summary generation
Task: T009 [P] [US1] Create unit test for snapshot tools

# Launch implementation tasks in order:
Task: T010 [P] [US1] Implement snapshot tools (can start after tests written)
Task: T011 [US1] Implement tactical summary generation logic (depends on T010)
Task: T012 [US1] Export snapshot tools (depends on T010)
Task: T013 [US1] Add error handling and logging (depends on T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Intel agent observes and summarizes)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (Change detection)
4. Add User Story 3 → Test independently → Deploy/Demo (Decision-making)
5. Add User Story 4 → Test independently → Deploy/Demo (Command translation)
6. Add User Story 5 → Test independently → Deploy/Demo (Full orchestration)
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Intel agent)
   - Developer B: User Story 2 (Change detection) - can start after US1 tests pass
   - Developer C: User Story 3 (Commander agent) - can start after US1 complete
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **ALL tests MUST run in Docker container** (per constitution)
- Code snippets provided to guide LLM implementation
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

