/**
 * Unit tests for snapshot tools.
 *
 * Tests snapshot tools used by Intel agent for fetching and summarizing snapshots.
 *
 * CRITICAL: ALL tests MUST run in Docker container (per constitution).
 * Docker test command: docker exec bfis npm test -- bfis-service/src/agents/__tests__/tools/snapshot-tools.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getSnapshotSummaryTool } from "../../tools/snapshot-tools.js";
import type { BfisContextSnapshot } from "../../../context/types.js";

describe("SnapshotTools", () => {
  describe("getSnapshotSummaryTool", () => {
    test("generates tactical summary from snapshot", async () => {
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

      const summary = await getSnapshotSummaryTool.invoke({ snapshot: mockSnapshot });

      assert.ok(summary);
      assert.strictEqual(summary.snapshotId, "test-1");
      assert.strictEqual(summary.unitCounts.BLUE, 1);
      assert.ok(Array.isArray(summary.keyPositions));
      assert.ok(Array.isArray(summary.threats));
    });
  });
});

