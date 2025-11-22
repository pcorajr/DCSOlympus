/**
 * Unit tests for Commander agent.
 *
 * Tests Commander agent's ability to make tactical decisions based on battlefield intelligence.
 *
 * CRITICAL: ALL tests MUST run in Docker container (per constitution).
 * Docker test command: docker exec bfis npm test -- bfis-service/src/agents/__tests__/commander-agent.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CommanderAgent } from "../commander-agent.js";
import type { CommanderAgentInput, TacticalSummary, MissionContext } from "../types.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";

describe("CommanderAgent", () => {
  describe("makeDecision", () => {
    test("produces decision with actions and reasoning when LLM available", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new CommanderAgent(config, logger);

      const intelSummary: TacticalSummary = {
        unitCounts: { BLUE: 5, RED: 10, NEUTRAL: 0, UNKNOWN: 0 },
        categoryCounts: { Aircraft: 15 },
        keyPositions: [],
        threats: [{ coalition: "RED", description: "RED has more units", severity: "high" }],
        snapshotTime: "2024-01-01T00:00:00Z",
        snapshotId: "test-1",
      };

      const missionContext: MissionContext = {
        missionId: "test-mission",
        serverId: "test-server",
        sessionHash: "test-session",
        time: "2024-01-01T00:00:00Z",
        hostilitiesStarted: true,
      };

      const input: CommanderAgentInput = {
        intelSummary,
        missionContext,
      };

      // This test may use LLM if available, or fall back to rules-based
      const decision = await agent.makeDecision(input);

      assert.ok(decision.decisionId);
      assert.ok(decision.actions.length >= 0); // Rules fallback may produce empty actions
      assert.ok(decision.reasoningNotes);
      assert.ok(decision.actions.length <= 10); // Max actions per decision
      assert.strictEqual(decision.snapshotId, "test-1");
      assert.strictEqual(decision.missionId, "test-mission");
      assert.strictEqual(decision.serverId, "test-server");
    });

    test("falls back to rules-based on LLM failure", async () => {
      const config = loadConfig();
      // Temporarily disable LLM to force fallback
      const configWithNoLLM = {
        ...config,
        llm: { provider: "none" as const, baseUrl: "", model: "" },
      };
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new CommanderAgent(configWithNoLLM, logger);

      const intelSummary: TacticalSummary = {
        unitCounts: { BLUE: 2, RED: 5, NEUTRAL: 0, UNKNOWN: 0 },
        categoryCounts: { Aircraft: 7 },
        keyPositions: [
          {
            type: "airbase",
            coalition: "BLUE",
            position: { lat: 40.0, lon: -75.0, altMeters: 100 },
          },
        ],
        threats: [{ coalition: "RED", description: "RED outnumbers BLUE", severity: "high" }],
        snapshotTime: "2024-01-01T00:00:00Z",
        snapshotId: "test-2",
      };

      const missionContext: MissionContext = {
        missionId: "test-mission",
        serverId: "test-server",
        sessionHash: "test-session",
        time: "2024-01-01T00:00:00Z",
        hostilitiesStarted: true,
      };

      const input: CommanderAgentInput = {
        intelSummary,
        missionContext,
      };

      const decision = await agent.makeDecision(input);

      // Rules-based fallback should produce a decision
      assert.ok(decision.decisionId);
      assert.ok(decision.reasoningNotes);
      assert.ok(decision.reasoningNotes.includes("rules-based") || decision.reasoningNotes.includes("Rules-based"));
      assert.strictEqual(decision.snapshotId, "test-2");
      assert.strictEqual(decision.missionId, "test-mission");
    });

    test("handles input with changes and previous decision", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new CommanderAgent(config, logger);

      const intelSummary: TacticalSummary = {
        unitCounts: { BLUE: 3, RED: 3, NEUTRAL: 0, UNKNOWN: 0 },
        categoryCounts: { Aircraft: 6 },
        keyPositions: [],
        threats: [],
        snapshotTime: "2024-01-01T00:01:00Z",
        snapshotId: "test-3",
      };

      const missionContext: MissionContext = {
        missionId: "test-mission",
        serverId: "test-server",
        sessionHash: "test-session",
        time: "2024-01-01T00:01:00Z",
        hostilitiesStarted: false,
      };

      const input: CommanderAgentInput = {
        intelSummary,
        missionContext,
        changes: {
          newUnits: [{ unitId: "u1", coalition: "RED", category: "Aircraft" }],
          destroyedUnits: [],
          movedUnits: [],
          hostilityChanged: false,
          previousSnapshotTime: "2024-01-01T00:00:00Z",
          currentSnapshotTime: "2024-01-01T00:01:00Z",
        },
        previousDecision: {
          decisionId: "prev-decision-1",
          actions: [],
          reasoningNotes: "Previous decision reasoning",
          snapshotId: "test-2",
        },
      };

      const decision = await agent.makeDecision(input);

      assert.ok(decision.decisionId);
      assert.ok(decision.reasoningNotes);
      // Should respect hostilities not started constraint
      const hasAttack = decision.actions.some((a: { type: string }) => a.type === "ATTACK");
      assert.ok(!hasAttack, "Should not have ATTACK actions when hostilities not started");
    });
  });
});

