/**
 * Tests for SnapshotReader class.
 * 
 * Tests cover:
 * - probeMissionOnce: connectivity and authentication verification
 * - readOnce: snapshot construction with mission data
 * - readContextOnce: complete context snapshot with all battlefield data
 * 
 * **ALL tests use real Olympus instance - no mocks.**
 * 
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
 * 
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     bfis-service \
 *     node --test build/bfis-service/src/snapshot/__tests__/snapshot-reader.test.js
 * 
 * DO NOT run tests directly on host - use Docker container only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotReader } from "../snapshot-reader.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";

describe("SnapshotReader", () => {
  describe("probeMissionOnce", () => {
    test("logs bfis-olympus-probe-ok on success", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const reader = new SnapshotReader(config, logger);

      // Capture logs
      const logs: Array<{ event: string; meta?: Record<string, unknown> }> = [];
      const originalInfo = logger.info.bind(logger);
      logger.info = (event: string, meta?: Record<string, unknown>) => {
        logs.push({ event, meta });
        originalInfo(event, meta);
      };

      await reader.probeMissionOnce();

      // Verify log was called with correct event
      const probeLog = logs.find((log) => log.event === "bfis-olympus-probe-ok");
      assert.ok(probeLog !== undefined, "Expected bfis-olympus-probe-ok log event");
      if (probeLog) {
        assert.strictEqual(probeLog.meta?.status, 200);
        assert.ok(probeLog.meta?.url !== undefined);
        console.log(`   ✓ Connected to: ${probeLog.meta?.url}`);
      }
    });
  });

  describe("readOnce", () => {
    test("constructs snapshot with mission data", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const reader = new SnapshotReader(config, logger);

      // Capture logs
      const logs: Array<{ event: string; meta?: Record<string, unknown> }> = [];
      const originalInfo = logger.info.bind(logger);
      logger.info = (event: string, meta?: Record<string, unknown>) => {
        logs.push({ event, meta });
        originalInfo(event, meta);
      };

      const snapshot = await reader.readOnce();

      // Verify snapshot structure
      assert.strictEqual(typeof snapshot.snapshotId, "string");
      assert.ok(snapshot.snapshotId.length > 0, "snapshotId should be non-empty");
      assert.strictEqual(typeof snapshot.missionId, "string");
      assert.strictEqual(typeof snapshot.serverId, "string");
      assert.strictEqual(typeof snapshot.sessionHash, "string");
      assert.ok(snapshot.sessionHash.length > 0, "sessionHash should be non-empty");
      assert.strictEqual(typeof snapshot.time, "string");
      assert.ok(Array.isArray(snapshot.units), "units should be an array");
      assert.ok(snapshot.units.length >= 0, "units should be a valid array (may be empty or populated)");

      // Verify log was called
      const readLog = logs.find((log) => log.event === "bfis-snapshot-read-ok");
      assert.ok(readLog !== undefined, "Expected bfis-snapshot-read-ok log event");
      if (readLog) {
        assert.strictEqual(readLog.meta?.snapshotId, snapshot.snapshotId);
        assert.strictEqual(readLog.meta?.sessionHash, snapshot.sessionHash);
      }

      // Print snapshot details for verification
      console.log("\n   Snapshot from real Olympus:");
      console.log(`   - snapshotId: ${snapshot.snapshotId}`);
      console.log(`   - missionId: ${snapshot.missionId}`);
      console.log(`   - serverId: ${snapshot.serverId}`);
      console.log(`   - sessionHash: ${snapshot.sessionHash}`);
      console.log(`   - time: ${snapshot.time}`);
      console.log(`   - units: ${snapshot.units.length}\n`);
    });
  });

  describe("spec-002 User Story 1: Complete Context Snapshot", () => {
    test("readContextOnce returns complete snapshot", async () => {
      const config = loadConfig();
      const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
      const reader = new SnapshotReader(config, logger);

      const snapshot = await reader.readContextOnce();

      // Verify structure
      assert.ok(snapshot.base, "base snapshot should exist");
      assert.strictEqual(typeof snapshot.base.snapshotId, "string");
      assert.strictEqual(typeof snapshot.base.sessionHash, "string");
      
      // Check that context arrays exist (might be empty depending on mission state, but must be arrays)
      assert.ok(Array.isArray(snapshot.airbases), "airbases should be array");
      assert.ok(Array.isArray(snapshot.bullseyes), "bullseyes should be array");
      assert.ok(Array.isArray(snapshot.spots), "spots should be array");
      assert.ok(Array.isArray(snapshot.drawings), "drawings should be array");
      assert.ok(Array.isArray(snapshot.logs), "logs should be array");
      assert.ok(snapshot.weaponsSummary, "weaponsSummary should exist");
      assert.strictEqual(typeof snapshot.weaponsSummary.activeCount, "number");

      // Log what we found for verification
      console.log(`\n   ✓ Integration Snapshot ID: ${snapshot.base.snapshotId}`);
      console.log(`   ✓ Session: ${snapshot.base.sessionHash}`);
      console.log(`   ✓ Airbases: ${snapshot.airbases.length}`);
      console.log(`   ✓ Bullseyes: ${snapshot.bullseyes.length}`);
      console.log(`   ✓ Spots: ${snapshot.spots.length}`);
      console.log(`   ✓ Drawings: ${snapshot.drawings.length}`);
      console.log(`   ✓ Logs: ${snapshot.logs.length}`);
      console.log(`   ✓ Weapons: ${snapshot.weaponsSummary.activeCount}\n`);
    });
  });
});
