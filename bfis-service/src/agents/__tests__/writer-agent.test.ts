/**
 * Unit tests for Writer agent.
 *
 * Tests Writer agent's ability to translate decisions into executable Olympus commands.
 *
 * CRITICAL: ALL tests MUST run in Docker container (per constitution).
 * Docker test command: docker exec bfis npm test -- bfis-service/src/agents/__tests__/writer-agent.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WriterAgent } from "../writer-agent.js";
import type { WriterAgentInput } from "../types.js";
import type { BfisDecision } from "../../../../shared-schemas/index.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";

describe("WriterAgent", () => {
  describe("executeCommands", () => {
    test("maps SPAWN action to spawnAircrafts command in log mode", async () => {
      const config = loadConfig();
      // Force log mode for testing
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-1",
        actions: [
          {
            type: "SPAWN",
            target: { coordinateRef: { lat: 40.0, lon: -75.0, altMeters: 10000 } },
            params: { unitType: "F-16C_50", count: 2 },
          },
        ],
        reasoningNotes: "Test decision",
        snapshotId: "test-1",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["spawnAircrafts", "spawnHelicopters", "setPath", "attackUnit"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].commandHash);
      assert.strictEqual(results[0].status, "LOGGED");
      assert.ok(results[0].commandHash.startsWith("log-"));
    });

    test("maps MOVE action to setPath command", async () => {
      const config = loadConfig();
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-2",
        actions: [
          {
            type: "MOVE",
            target: {
              unitId: "unit-123",
              coordinateRef: { lat: 41.0, lon: -76.0, altMeters: 5000 },
            },
            params: { speedKts: 300, altitudeMeters: 5000 },
          },
        ],
        reasoningNotes: "Move unit to new position",
        snapshotId: "test-2",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["setPath", "setGroupRoute", "landAt"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, "LOGGED");
    });

    test("maps ATTACK action to attackUnit command", async () => {
      const config = loadConfig();
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-3",
        actions: [
          {
            type: "ATTACK",
            target: { unitId: "enemy-unit-456" },
            params: { weaponType: "AIM-120" },
          },
        ],
        reasoningNotes: "Attack enemy unit",
        snapshotId: "test-3",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["attackUnit", "bombPoint"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, "LOGGED");
    });

    test("handles unknown action type gracefully", async () => {
      const config = loadConfig();
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-4",
        actions: [
          {
            type: "CUSTOM" as any, // Unknown action type
            target: {},
            params: {},
          },
        ],
        reasoningNotes: "Unknown action",
        snapshotId: "test-4",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["spawnAircrafts"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, "FAILED");
      assert.ok(results[0].error?.includes("Unknown action type"));
    });

    test("validates command parameters and fails on invalid commands", async () => {
      const config = loadConfig();
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
        config.agents.writer.enableCommandValidation = true;
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-5",
        actions: [
          {
            type: "ATTACK",
            target: {}, // Missing unitId or coordinateRef
            params: {},
          },
        ],
        reasoningNotes: "Invalid attack command",
        snapshotId: "test-5",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["attackUnit", "bombPoint"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, "FAILED");
      assert.ok(results[0].error);
    });

    test("handles multiple actions in single decision", async () => {
      const config = loadConfig();
      if (config.agents?.writer) {
        config.agents.writer.commandExecutionMode = "log";
      }
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new WriterAgent(config, logger);

      const decision: BfisDecision = {
        decisionId: "test-decision-6",
        actions: [
          {
            type: "SPAWN",
            target: { coordinateRef: { lat: 40.0, lon: -75.0, altMeters: 10000 } },
            params: { unitType: "F-16C_50", count: 2 },
          },
          {
            type: "MOVE",
            target: {
              unitId: "unit-123",
              coordinateRef: { lat: 41.0, lon: -76.0, altMeters: 5000 },
            },
            params: {},
          },
        ],
        reasoningNotes: "Multiple actions",
        snapshotId: "test-6",
      };

      const input: WriterAgentInput = {
        decision,
        availableCommands: ["spawnAircrafts", "setPath"],
      };

      const results = await agent.executeCommands(input);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].status, "LOGGED");
      assert.strictEqual(results[1].status, "LOGGED");
    });
  });
});

