/**
 * Unit tests for Intel agent.
 *
 * Tests Intel agent's ability to observe battlefield state and generate tactical summaries.
 *
 * CRITICAL: ALL tests MUST run in Docker container (per constitution).
 * Docker test command: docker exec bfis npm test -- bfis-service/src/agents/__tests__/intel-agent.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IntelAgent } from "../intel-agent.js";
import type { BfisContextSnapshot } from "../../context/types.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";

describe("IntelAgent", () => {
  describe("process", () => {
    test("generates tactical summary with unit counts by coalition", async () => {
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
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const output = await agent.process(mockSnapshot, null);

      assert.strictEqual(output.summary.unitCounts.BLUE, 1);
      assert.strictEqual(output.summary.unitCounts.RED, 1);
      assert.strictEqual(output.summary.unitCounts.NEUTRAL, 0);
      assert.strictEqual(output.summary.unitCounts.UNKNOWN, 0);
      assert.strictEqual(output.summary.snapshotId, "test-1");
      assert.strictEqual(output.summary.snapshotTime, "2024-01-01T00:00:00Z");
    });

    test("generates tactical summary with category counts", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const mockSnapshot: BfisContextSnapshot = {
        base: {
          snapshotId: "test-2",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
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
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40.1, lon: -75.1, altMeters: 10000 },
            },
            {
              unitId: "u3",
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
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const output = await agent.process(mockSnapshot, null);

      assert.strictEqual(output.summary.categoryCounts.Aircraft, 2);
      assert.strictEqual(output.summary.categoryCounts.GroundUnit, 1);
    });

    test("includes key positions from airbases and bullseyes", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const mockSnapshot: BfisContextSnapshot = {
        base: {
          snapshotId: "test-3",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:00:00Z",
          units: [],
        },
        airbases: [
          {
            id: "ab1",
            name: "Test Airbase",
            coalition: "BLUE",
            position: { lat: 40.0, lon: -75.0, altMeters: 100 },
          },
        ],
        bullseyes: [
          {
            id: "be1",
            coalition: "RED",
            position: { lat: 41.0, lon: -76.0, altMeters: 0 },
          },
        ],
        spots: [],
        drawings: [],
        logs: [],
        weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const output = await agent.process(mockSnapshot, null);

      assert.strictEqual(output.summary.keyPositions.length, 2);
      assert.strictEqual(output.summary.keyPositions[0].type, "airbase");
      assert.strictEqual(output.summary.keyPositions[0].coalition, "BLUE");
      assert.strictEqual(output.summary.keyPositions[1].type, "bullseye");
      assert.strictEqual(output.summary.keyPositions[1].coalition, "RED");
    });

    test("generates threat assessments based on unit counts", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      // Create snapshot with RED having significantly more units (high threat)
      const mockSnapshot: BfisContextSnapshot = {
        base: {
          snapshotId: "test-4",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:00:00Z",
          units: [
            // 2 BLUE units
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40, lon: -75, altMeters: 10000 },
            },
            {
              unitId: "u2",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40.1, lon: -75.1, altMeters: 10000 },
            },
            // 5 RED units (more than 1.5x BLUE = high threat)
            {
              unitId: "u3",
              coalition: "RED",
              category: "GroundUnit",
              position: { lat: 41, lon: -76, altMeters: 0 },
            },
            {
              unitId: "u4",
              coalition: "RED",
              category: "GroundUnit",
              position: { lat: 41.1, lon: -76.1, altMeters: 0 },
            },
            {
              unitId: "u5",
              coalition: "RED",
              category: "GroundUnit",
              position: { lat: 41.2, lon: -76.2, altMeters: 0 },
            },
            {
              unitId: "u6",
              coalition: "RED",
              category: "GroundUnit",
              position: { lat: 41.3, lon: -76.3, altMeters: 0 },
            },
            {
              unitId: "u7",
              coalition: "RED",
              category: "GroundUnit",
              position: { lat: 41.4, lon: -76.4, altMeters: 0 },
            },
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

      // Should have at least one threat (high severity since RED > 1.5x BLUE)
      assert.ok(output.summary.threats.length > 0);
      const highThreat = output.summary.threats.find((t) => t.severity === "high");
      assert.ok(highThreat, "Should have high-severity threat when RED significantly outnumbers BLUE");
      assert.strictEqual(highThreat?.coalition, "RED");
    });

    test("identifies new units in change detection", async () => {
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
          units: [
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40, lon: -75, altMeters: 10000 },
            },
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

      const current: BfisContextSnapshot = {
        base: {
          snapshotId: "curr-1",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:01:00Z",
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
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const output = await agent.process(current, previous);

      assert.ok(output.changes);
      assert.strictEqual(output.changes!.newUnits.length, 1);
      assert.strictEqual(output.changes!.newUnits[0].unitId, "u2");
      assert.strictEqual(output.changes!.newUnits[0].coalition, "RED");
    });

    test("identifies destroyed units in change detection", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const previous: BfisContextSnapshot = {
        base: {
          snapshotId: "prev-2",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
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
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const current: BfisContextSnapshot = {
        base: {
          snapshotId: "curr-2",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:01:00Z",
          units: [
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40, lon: -75, altMeters: 10000 },
            },
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

      const output = await agent.process(current, previous);

      assert.ok(output.changes);
      assert.strictEqual(output.changes!.destroyedUnits.length, 1);
      assert.strictEqual(output.changes!.destroyedUnits[0].unitId, "u2");
    });

    test("identifies moved units beyond threshold", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const previous: BfisContextSnapshot = {
        base: {
          snapshotId: "prev-3",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:00:00Z",
          units: [
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40.0, lon: -75.0, altMeters: 10000 },
            },
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

      const current: BfisContextSnapshot = {
        base: {
          snapshotId: "curr-3",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:01:00Z",
          units: [
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40.1, lon: -75.1, altMeters: 10000 }, // Moved ~11km (should exceed 1km threshold)
            },
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

      const output = await agent.process(current, previous);

      assert.ok(output.changes);
      assert.strictEqual(output.changes!.movedUnits.length, 1);
      assert.strictEqual(output.changes!.movedUnits[0].unitId, "u1");
    });

    test("detects hostility status change", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const previous: BfisContextSnapshot = {
        base: {
          snapshotId: "prev-4",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:00:00Z",
          units: [],
        },
        airbases: [],
        bullseyes: [],
        spots: [],
        drawings: [],
        logs: [],
        weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
        hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
      };

      const current: BfisContextSnapshot = {
        base: {
          snapshotId: "curr-4",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "test-session",
          time: "2024-01-01T00:01:00Z",
          units: [],
        },
        airbases: [],
        bullseyes: [],
        spots: [],
        drawings: [],
        logs: [],
        weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
        hostility: { hostilitiesStarted: true, sessionHash: "test-session" },
      };

      const output = await agent.process(current, previous);

      assert.ok(output.changes);
      assert.strictEqual(output.changes!.hostilityChanged, true);
    });

    test("detects session hash change and clears previous snapshot", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const agent = new IntelAgent(config, logger);

      const previous: BfisContextSnapshot = {
        base: {
          snapshotId: "prev-5",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "old-session",
          time: "2024-01-01T00:00:00Z",
          units: [
            {
              unitId: "u1",
              coalition: "BLUE",
              category: "Aircraft",
              position: { lat: 40, lon: -75, altMeters: 10000 },
            },
          ],
        },
        airbases: [],
        bullseyes: [],
        spots: [],
        drawings: [],
        logs: [],
        weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
        hostility: { hostilitiesStarted: false, sessionHash: "old-session" },
      };

      const current: BfisContextSnapshot = {
        base: {
          snapshotId: "curr-5",
          missionId: "test-mission",
          serverId: "test-server",
          sessionHash: "new-session", // Session changed
          time: "2024-01-01T00:01:00Z",
          units: [
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
        hostility: { hostilitiesStarted: false, sessionHash: "new-session" },
      };

      const output = await agent.process(current, previous);

      // Should not detect u2 as "new" because session changed (previous snapshot treated as null)
      assert.ok(output.changes === undefined, "Changes should be undefined when session hash changes");
    });
  });
});

