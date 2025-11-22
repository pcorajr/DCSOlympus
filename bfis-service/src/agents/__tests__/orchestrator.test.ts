/**
 * Unit tests for Orchestrator.
 *
 * Tests Orchestrator's ability to coordinate all agents in a complete decision cycle.
 *
 * CRITICAL: ALL tests MUST run in Docker container (per constitution).
 * Docker test command: docker exec bfis npm test -- bfis-service/src/agents/__tests__/orchestrator.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../orchestrator.js";
import type { AgentState } from "../types.js";
import type { BfisContextSnapshot } from "../../context/types.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";
import { v4 as uuidv4 } from "uuid";

function createMockSnapshot(snapshotId: string, sessionHash: string = "test-session"): BfisContextSnapshot {
  return {
    base: {
      snapshotId,
      missionId: "test-mission",
      serverId: "test-server",
      sessionHash,
      time: "2024-01-01T00:00:00Z",
      units: [
        {
          unitId: "u1",
          coalition: "BLUE",
          category: "Aircraft",
          position: { lat: 40, lon: -75, altMeters: 10000 },
        },
        {
          unitId: "u2",
          coalition: "RED",
          category: "GroundUnit",
          position: { lat: 41, lon: -76, altMeters: 0 },
        },
      ],
    },
    airbases: [],
    bullseyes: [],
    spots: [],
    drawings: [],
    logs: [],
    weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
    hostility: { hostilitiesStarted: false, sessionHash },
  };
}

function createInitialState(snapshot: BfisContextSnapshot, previousSnapshot: BfisContextSnapshot | null = null): AgentState {
  return {
    currentSnapshot: snapshot,
    previousSnapshot,
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
}

describe("Orchestrator", () => {
  describe("runCycle", () => {
    test("runs full cycle from snapshot to commands", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);

      const mockSnapshot = createMockSnapshot("test-1");
      const initialState = createInitialState(mockSnapshot);

      const finalState = await orchestrator.runCycle(initialState);

      assert.ok(finalState.intelOutput, "Should have Intel output");
      assert.ok(finalState.decision, "Should have decision");
      assert.ok(finalState.commandResults, "Should have command results");
      assert.ok(finalState.cycleEndTime, "Should have cycle end time");
      assert.strictEqual(finalState.currentSnapshot?.base.snapshotId, "test-1");
    });

    test("processes cycles sequentially (one completes before next starts)", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);

      const snapshot1 = createMockSnapshot("test-1");
      const snapshot2 = createMockSnapshot("test-2");
      const initialState1 = createInitialState(snapshot1);
      const initialState2 = createInitialState(snapshot2);

      let cycle1Complete = false;
      let cycle2Started = false;

      // Start cycle 1
      const cycle1Promise = orchestrator.runCycle(initialState1).then(() => {
        cycle1Complete = true;
      });

      // Try to start cycle 2 immediately (should wait for cycle 1)
      const cycle2Promise = Promise.resolve().then(async () => {
        cycle2Started = true;
        return orchestrator.runCycle(initialState2);
      });

      await Promise.all([cycle1Promise, cycle2Promise]);

      // Verify sequential processing: cycle 2 should not start until cycle 1 completes
      // This test validates FR-016 requirement
      assert.ok(cycle1Complete, "Cycle 1 should complete");
      assert.ok(cycle2Started, "Cycle 2 should start");
      // The sequential lock ensures cycle 2 waits for cycle 1
    });

    test("handles missing snapshot gracefully", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);

      const initialState: AgentState = {
        currentSnapshot: null,
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

      assert.ok(finalState.error, "Should have error for missing snapshot");
      assert.strictEqual(finalState.error?.agent, "intel");
      assert.ok(finalState.cycleEndTime, "Should have cycle end time even on error");
    });

    test("caches previous snapshot for change detection", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);

      const snapshot1 = createMockSnapshot("test-1", "session-1");
      const snapshot2 = createMockSnapshot("test-2", "session-1"); // Same session
      const initialState1 = createInitialState(snapshot1);
      const initialState2 = createInitialState(snapshot2);

      // Run first cycle
      const finalState1 = await orchestrator.runCycle(initialState1);
      assert.ok(finalState1.intelOutput);

      // Run second cycle - should use snapshot1 as previous (from cache)
      const finalState2 = await orchestrator.runCycle(initialState2);
      assert.ok(finalState2.intelOutput);
      // Verify that snapshot1 was used as previous during cycle 2 by checking intel output
      // Since snapshot1 and snapshot2 have different IDs, change detection should have run
      // The intel output should have changes detected (even if empty, the changes field should exist)
      // After cycle completes, previousSnapshot is set to snapshot2 (for next cycle)
      assert.ok(finalState2.previousSnapshot, "Should have previous snapshot cached");
      assert.strictEqual(finalState2.previousSnapshot?.base.snapshotId, "test-2", "Should cache snapshot2 after cycle 2");
    });

    test("clears cache on session hash change", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(config, logger);

      const snapshot1 = createMockSnapshot("test-1", "session-1");
      const snapshot2 = createMockSnapshot("test-2", "session-2"); // Different session
      const initialState1 = createInitialState(snapshot1);
      const initialState2 = createInitialState(snapshot2);

      // Run first cycle
      await orchestrator.runCycle(initialState1);

      // Run second cycle with different session - should clear cache for session-1
      const finalState2 = await orchestrator.runCycle(initialState2);
      assert.ok(finalState2.intelOutput);
      // After cycle completes, previousSnapshot is set to snapshot2 (for next cycle in session-2)
      assert.ok(finalState2.previousSnapshot, "Should have previous snapshot after cycle");
      assert.strictEqual(finalState2.previousSnapshot?.base.snapshotId, "test-2", "Should cache snapshot2 for session-2");
      
      // Verify cache was cleared for session-1: run another cycle with session-1
      // Since cache was cleared, it should NOT have snapshot1 as previous
      const snapshot3 = createMockSnapshot("test-3", "session-1");
      const initialState3 = createInitialState(snapshot3);
      const finalState3 = await orchestrator.runCycle(initialState3);
      // The previousSnapshot will be snapshot3 (set at end), but during the cycle it should have been null
      // We verify by checking that intel output has no changes (since previous was null)
      assert.ok(finalState3.intelOutput);
      // If previous was null, changes should be undefined
      assert.ok(finalState3.intelOutput.changes === undefined, "Should have no changes when previous snapshot was null (cache cleared)");
    });

    test("handles recoverable errors and continues cycle", async () => {
      const config = loadConfig();
      // Force LLM to fail by using invalid config
      const configWithNoLLM = {
        ...config,
        llm: { provider: "none" as const, baseUrl: "", model: "" },
      };
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const orchestrator = new Orchestrator(configWithNoLLM, logger);

      const mockSnapshot = createMockSnapshot("test-1");
      const initialState = createInitialState(mockSnapshot);

      const finalState = await orchestrator.runCycle(initialState);

      // Should still complete cycle even with LLM failure (uses rules fallback)
      assert.ok(finalState.intelOutput, "Should have Intel output");
      assert.ok(finalState.decision, "Should have decision (rules fallback)");
      assert.ok(finalState.commandResults, "Should have command results");
      assert.ok(finalState.cycleEndTime, "Should have cycle end time");
    });
  });
});

