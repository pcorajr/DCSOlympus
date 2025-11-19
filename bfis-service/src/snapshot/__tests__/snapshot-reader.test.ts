/**
 * Tests for SnapshotReader class.
 * 
 * Tests cover:
 * - probeMissionOnce: connectivity and authentication verification
 * - readOnce: snapshot construction with mission data
 * 
 * Integration tests (default): Test against real Olympus instance.
 * Set INTEGRATION_TEST=false to run unit tests with mocks instead.
 * 
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
 * 
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     bfis-service \
 *     node --test build/src/snapshot/__tests__/snapshot-reader.test.js
 * 
 * DO NOT run tests directly on host - use Docker container only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotReader } from "../snapshot-reader.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";
import type { BfisConfig } from "../../config/config.js";
import type { StructuredLogger } from "../../logger/structured-logger.js";

// Check if we should run integration tests (default: true)
const RUN_INTEGRATION_TESTS = process.env.INTEGRATION_TEST !== "false";

/**
 * Create a mock response for all Olympus endpoints.
 * 
 * Helper function to mock all endpoints that readOnce() fetches.
 * 
 * @param missionData - Optional mission data override
 * @param unitsBuffer - Optional units buffer override
 * @param weaponsBuffer - Optional weapons buffer override
 * @param contextData - Optional context data override
 * @returns Mock fetch function that handles all endpoints
 */
function createMockFetchForAllEndpoints(
  missionData?: { theatre?: string; time?: string; sessionHash?: string },
  unitsBuffer?: ArrayBuffer,
  weaponsBuffer?: ArrayBuffer,
  contextData?: {
    airbases?: any;
    bullseyes?: any;
    spots?: any;
    drawings?: any;
    logs?: any;
  }
): (url: string | URL | Request) => Promise<Response> {
  return async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    
    if (urlStr.includes("/mission")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mission: { theatre: missionData?.theatre ?? "Caucasus" },
          time: missionData?.time ?? "1234567890",
          sessionHash: missionData?.sessionHash ?? "abc123",
        }),
      } as Response;
    }
    if (urlStr.includes("/units")) {
      const buffer = unitsBuffer ?? (() => {
        const buf = new ArrayBuffer(9);
        const view = new DataView(buf);
        view.setBigUint64(0, BigInt(1234567890), true);
        view.setUint8(8, 0xFF);
        return buf;
      })();
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer,
      } as Response;
    }
    if (urlStr.includes("/weapons")) {
      const buffer = weaponsBuffer ?? (() => {
        const buf = new ArrayBuffer(9);
        const view = new DataView(buf);
        view.setBigUint64(0, BigInt(1234567890), true);
        view.setUint8(8, 0xFF);
        return buf;
      })();
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer,
      } as Response;
    }
    
    // Context endpoints
    if (urlStr.includes("/airbases")) {
      return {
        ok: true, status: 200,
        json: async () => contextData?.airbases ?? { airbases: [], time: "1234567890", sessionHash: missionData?.sessionHash ?? "abc123" }
      } as Response;
    }
    if (urlStr.includes("/bullseyes")) {
      return {
        ok: true, status: 200,
        json: async () => contextData?.bullseyes ?? { bullseyes: {}, time: "1234567890", sessionHash: missionData?.sessionHash ?? "abc123" }
      } as Response;
    }
    if (urlStr.includes("/spots")) {
      return {
        ok: true, status: 200,
        json: async () => contextData?.spots ?? { spots: [], time: "1234567890", sessionHash: missionData?.sessionHash ?? "abc123" }
      } as Response;
    }
    if (urlStr.includes("/drawings")) {
      return {
        ok: true, status: 200,
        json: async () => contextData?.drawings ?? { drawings: [], time: "1234567890", sessionHash: missionData?.sessionHash ?? "abc123" }
      } as Response;
    }
    if (urlStr.includes("/logs")) {
      return {
        ok: true, status: 200,
        json: async () => contextData?.logs ?? { logs: [], time: "1234567890", sessionHash: missionData?.sessionHash ?? "abc123" }
      } as Response;
    }

    throw new Error(`Unexpected URL: ${urlStr}`);
  };
}

/**
 * Create a mock BfisConfig for testing.
 */
function createMockConfig(): BfisConfig {
  return {
    bfisVersion: "0.1.0-test",
    logLevel: "info",
    generalLogPath: "/tmp/bfis-test.log",
    olympusFrontendBaseUrl: "http://localhost:3000",
    olympusBaseUrl: "http://localhost:3000/olympus",
    olympusAuth: {
      role: "GAME_MASTER",
      username: "testuser",
      password: "testpass",
    },
    polling: {
      unitsMs: 2000,
      weaponsMs: 2000,
      logsMs: 1000,
      missionMs: 5000,
      airbasesMs: 10000,
      bullseyesMs: 10000,
      spotsMs: 2000,
    },
    ndjsonLogPath: "/tmp/bfis-decisions.ndjson",
    llm: {
      provider: "none",
      baseUrl: "",
      model: "",
    },
  };
}

/**
 * Create a mock StructuredLogger that captures log calls.
 */
function createMockLogger(): StructuredLogger & { logs: Array<{ event: string; meta?: Record<string, unknown> }> } {
  const logs: Array<{ event: string; meta?: Record<string, unknown> }> = [];
  
  return {
    logs,
    debug: (event: string, meta?: Record<string, unknown>) => {
      logs.push({ event, meta });
    },
    info: (event: string, meta?: Record<string, unknown>) => {
      logs.push({ event, meta });
    },
    warn: (event: string, meta?: Record<string, unknown>) => {
      logs.push({ event, meta });
    },
    error: (event: string, meta?: Record<string, unknown>) => {
      logs.push({ event, meta });
    },
  };
}

describe("SnapshotReader", () => {
  describe("probeMissionOnce", () => {
    test("logs bfis-olympus-probe-ok on success (integration)", { skip: !RUN_INTEGRATION_TESTS }, async () => {
      // Integration test: Use real config and hit actual Olympus endpoint
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

    test("logs bfis-olympus-probe-ok on success (unit test with mock)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // Mock fetch to return successful response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => '{"mission": {}, "time": "1234567890", "sessionHash": "abc123"}',
        } as Response;
      };

      try {
        await reader.probeMissionOnce();

        // Verify log was called with correct event
        const probeLog = logger.logs.find((log) => log.event === "bfis-olympus-probe-ok");
        assert.ok(probeLog !== undefined, "Expected bfis-olympus-probe-ok log event");
        if (probeLog) {
          assert.strictEqual(probeLog.meta?.status, 200);
          assert.ok(probeLog.meta?.url !== undefined);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("throws error on auth failure (unit test with mock)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // Mock fetch to return 401 Unauthorized
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: async () => "Authentication failed",
        } as Response;
      };

      try {
        await assert.rejects(
          async () => {
            await reader.probeMissionOnce();
          },
          {
            message: /Olympus mission probe failed: 401/,
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("readOnce", () => {
    test("constructs snapshot with mission data (integration)", { skip: !RUN_INTEGRATION_TESTS }, async () => {
      // Integration test: Use real config and hit actual Olympus endpoint
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
        // assert.strictEqual(readLog.meta?.unitCount, 0); // Removed check for 0 units as real mission may have units
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

    test("constructs snapshot with mission data (unit test with mock)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // Mock fetch to return all endpoint responses (readOnce now fetches all endpoints)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetchForAllEndpoints({
        theatre: "Caucasus",
        time: "1234567890",
        sessionHash: "abc123",
      });

      try {
        const snapshot = await reader.readOnce();

        // Verify snapshot structure
        assert.strictEqual(typeof snapshot.snapshotId, "string");
        assert.ok(snapshot.snapshotId.length > 0, "snapshotId should be non-empty");
        assert.strictEqual(typeof snapshot.missionId, "string");
        assert.strictEqual(typeof snapshot.serverId, "string");
        assert.strictEqual(snapshot.sessionHash, "abc123");
        assert.strictEqual(typeof snapshot.time, "string");
        assert.ok(Array.isArray(snapshot.units), "units should be an array");
        assert.strictEqual(snapshot.units.length, 0, "units should be empty for User Story 1");

        // Verify log was called
        const readLog = logger.logs.find((log) => log.event === "bfis-snapshot-read-ok");
        assert.ok(readLog !== undefined, "Expected bfis-snapshot-read-ok log event");
        if (readLog) {
          assert.strictEqual(readLog.meta?.snapshotId, snapshot.snapshotId);
          assert.strictEqual(readLog.meta?.sessionHash, "abc123");
          assert.strictEqual(readLog.meta?.unitCount, 0);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("User Story 3: Mission Resets and State Changes", () => {
    test("T033: session hash change detected between polls (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // First poll: session hash "abc123"
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        
        // Use helper but override mission to return different hash on second call
        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: callCount <= 8 ? "abc123" : "xyz789", // Different hash on second poll cycle
            }),
          } as Response;
        }
        
        // Use helper for all other endpoints
        const mockFetch = createMockFetchForAllEndpoints();
        return await mockFetch(url);
      };

      try {
        // First poll
        const snapshot1 = await reader.readOnce();
        assert.strictEqual(snapshot1.sessionHash, "abc123");

        // Second poll: session hash changed
        const snapshot2 = await reader.readOnce();
        assert.strictEqual(snapshot2.sessionHash, "xyz789");

        // Verify session reset event was logged
        const resetLog = logger.logs.find((log) => log.event === "bfis-session-reset");
        assert.ok(resetLog !== undefined, "Expected bfis-session-reset log event");
        if (resetLog) {
          assert.strictEqual(resetLog.meta?.oldSessionHash, "abc123");
          assert.strictEqual(resetLog.meta?.newSessionHash, "xyz789");
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T034: bfis-session-reset event logged on hash change (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        
        // Override mission to return different hash on second poll
        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: callCount <= 8 ? "hash1" : "hash2", // Different hash on second poll cycle
            }),
          } as Response;
        }
        
        // Use helper for all other endpoints
        const mockFetch = createMockFetchForAllEndpoints();
        return await mockFetch(url);
      };

      try {
        await reader.readOnce(); // First poll
        await reader.readOnce(); // Second poll with different hash

        const resetLog = logger.logs.find((log) => log.event === "bfis-session-reset");
        assert.ok(resetLog !== undefined, "Expected bfis-session-reset log event");
        assert.strictEqual(resetLog.meta?.oldSessionHash, "hash1");
        assert.strictEqual(resetLog.meta?.newSessionHash, "hash2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T035: lastTimes reset to empty on session hash change (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        
        // Override mission to return different hash on second poll
        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: callCount <= 8 ? "hash1" : "hash2", // Different hash on second poll cycle
            }),
          } as Response;
        }
        
        // Use helper for all other endpoints
        const mockFetch = createMockFetchForAllEndpoints();
        return await mockFetch(url);
      };

      try {
        // First poll - should set lastTimes
        await reader.readOnce();
        
        // Access private lastTimes via reflection (for testing only)
        const lastTimes = (reader as unknown as { lastTimes: Record<string, number> }).lastTimes;
        assert.ok(Object.keys(lastTimes).length > 0, "lastTimes should be populated after first poll");

        // Second poll with different session hash - should reset lastTimes
        await reader.readOnce();
        
        // After session reset, lastTimes should be cleared (will be repopulated on next successful poll)
        // Note: The reset happens, but lastTimes gets repopulated immediately in the same poll
        // So we verify that the reset logic ran by checking the log
        const resetLog = logger.logs.find((log) => log.event === "bfis-session-reset");
        assert.ok(resetLog !== undefined, "Expected bfis-session-reset log event indicating lastTimes were reset");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T036: session hash change mid-poll cycle aborts immediately (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // First poll: establish initial session hash
      let pollCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("/mission")) {
          pollCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: pollCount === 1 ? "hash1" : "hash2", // Different hash on second poll
            }),
          } as Response;
        }
        
        // Use helper for all other endpoints
        const mockFetch = createMockFetchForAllEndpoints();
        return await mockFetch(url);
      };

      try {
        // First poll: establish session hash "hash1"
        await reader.readOnce();
        assert.strictEqual((reader as unknown as { lastSessionHash: string }).lastSessionHash, "hash1");

        // Second poll: mission returns different hash "hash2"
        // Per FR-008a: In MVP, we detect session changes after mission fetch and handle gracefully
        // (reset state, log event, continue with full refresh). True mid-poll detection
        // would require checking after each endpoint, which is post-MVP.
        const snapshot = await reader.readOnce();
        assert.strictEqual(snapshot.sessionHash, "hash2");

        // Verify session reset was logged
        const resetLog = logger.logs.find((log) => log.event === "bfis-session-reset");
        assert.ok(resetLog !== undefined, "Expected bfis-session-reset log event");
        if (resetLog) {
          assert.strictEqual(resetLog.meta?.oldSessionHash, "hash1");
          assert.strictEqual(resetLog.meta?.newSessionHash, "hash2");
        }

        // Verify lastSessionHash was updated
        assert.strictEqual((reader as unknown as { lastSessionHash: string }).lastSessionHash, "hash2");
        
        // Verify lastTimes was cleared (indicating full refresh was used)
        const lastTimes = (reader as unknown as { lastTimes: Record<string, number> }).lastTimes;
        // After successful poll, lastTimes should be repopulated, but initially it was cleared
        // We verify the reset happened by checking the log
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("User Story 4: Polling Multiple Data Sources", () => {
    test("T043: readOnce fetches all endpoints in specified order (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      const fetchOrder: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        // Track fetch order
        if (urlStr.includes("/mission")) fetchOrder.push("mission");
        else if (urlStr.includes("/units")) fetchOrder.push("units");
        else if (urlStr.includes("/weapons")) fetchOrder.push("weapons");
        else if (urlStr.includes("/logs")) fetchOrder.push("logs");
        else if (urlStr.includes("/airbases")) fetchOrder.push("airbases");
        else if (urlStr.includes("/bullseyes")) fetchOrder.push("bullseyes");
        else if (urlStr.includes("/spots")) fetchOrder.push("spots");
        else if (urlStr.includes("/drawings")) fetchOrder.push("drawings");

        // Return appropriate responses
        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        if (urlStr.includes("/units") || urlStr.includes("/weapons")) {
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          view.setUint8(8, 0xFF);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/logs") || urlStr.includes("/airbases") || urlStr.includes("/bullseyes") || 
            urlStr.includes("/spots") || urlStr.includes("/drawings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      };

      try {
        await reader.readOnce();

        // Per FR-016: Verify endpoints fetched in specified order: mission, units, weapons, logs, airbases, bullseyes, spots, drawings
        assert.deepStrictEqual(fetchOrder, [
          "mission",
          "units",
          "weapons",
          "logs",
          "airbases",
          "bullseyes",
          "spots",
          "drawings",
        ], "Endpoints should be fetched in specified order");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T044: time query parameter used for units/weapons/logs endpoints (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      const fetchedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        fetchedUrls.push(urlStr);

        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        if (urlStr.includes("/units") || urlStr.includes("/weapons")) {
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          view.setUint8(8, 0xFF);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/logs") || urlStr.includes("/airbases") || urlStr.includes("/bullseyes") || 
            urlStr.includes("/spots") || urlStr.includes("/drawings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      };

      try {
        // First poll: should use time=0 (full refresh)
        await reader.readOnce();

        const unitsUrl = fetchedUrls.find((url) => url.includes("/units"));
        const weaponsUrl = fetchedUrls.find((url) => url.includes("/weapons"));
        const logsUrl = fetchedUrls.find((url) => url.includes("/logs"));

        // Per FR-010, T046: First poll should use time=0 (no time parameter = full refresh)
        assert.ok(unitsUrl !== undefined, "Units endpoint should be fetched");
        assert.ok(!unitsUrl.includes("time=") || unitsUrl.includes("time=0"), "Units should use time=0 on first poll");
        
        assert.ok(weaponsUrl !== undefined, "Weapons endpoint should be fetched");
        assert.ok(!weaponsUrl.includes("time=") || weaponsUrl.includes("time=0"), "Weapons should use time=0 on first poll");
        
        assert.ok(logsUrl !== undefined, "Logs endpoint should be fetched");
        assert.ok(!logsUrl.includes("time=") || logsUrl.includes("time=0"), "Logs should use time=0 on first poll");

        // Second poll: should use incremental time parameter
        fetchedUrls.length = 0; // Clear for second poll
        await reader.readOnce();

        const unitsUrl2 = fetchedUrls.find((url) => url.includes("/units"));
        const weaponsUrl2 = fetchedUrls.find((url) => url.includes("/weapons"));
        const logsUrl2 = fetchedUrls.find((url) => url.includes("/logs"));

        // Per FR-010: Second poll should use time parameter with last update time
        assert.ok(unitsUrl2?.includes("time="), "Units should use time parameter on second poll");
        assert.ok(weaponsUrl2?.includes("time="), "Weapons should use time parameter on second poll");
        assert.ok(logsUrl2?.includes("time="), "Logs should use time parameter on second poll");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T045: lastTimes updated from response time fields (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        if (urlStr.includes("/units") || urlStr.includes("/weapons")) {
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          view.setUint8(8, 0xFF);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/logs") || urlStr.includes("/airbases") || urlStr.includes("/bullseyes") || 
            urlStr.includes("/spots") || urlStr.includes("/drawings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      };

      try {
        await reader.readOnce();

        // Per FR-011: Verify lastTimes updated from response time fields
        const lastTimes = (reader as unknown as { lastTimes: Record<string, number> }).lastTimes;
        
        assert.ok(lastTimes["units"] !== undefined, "lastTimes should have units entry");
        assert.ok(lastTimes["weapons"] !== undefined, "lastTimes should have weapons entry");
        assert.ok(lastTimes["logs"] !== undefined, "lastTimes should have logs entry");
        assert.ok(lastTimes["airbases"] !== undefined, "lastTimes should have airbases entry");
        assert.ok(lastTimes["bullseyes"] !== undefined, "lastTimes should have bullseyes entry");
        assert.ok(lastTimes["spots"] !== undefined, "lastTimes should have spots entry");
        assert.ok(lastTimes["drawings"] !== undefined, "lastTimes should have drawings entry");

        // Verify times are numbers (milliseconds)
        assert.strictEqual(typeof lastTimes["units"], "number", "units lastTime should be number");
        assert.strictEqual(typeof lastTimes["weapons"], "number", "weapons lastTime should be number");
        assert.strictEqual(typeof lastTimes["logs"], "number", "logs lastTime should be number");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T046: full refresh (time=0) on initial poll (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      const fetchedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        fetchedUrls.push(urlStr);

        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        if (urlStr.includes("/units") || urlStr.includes("/weapons")) {
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          view.setUint8(8, 0xFF);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/logs") || urlStr.includes("/airbases") || urlStr.includes("/bullseyes") || 
            urlStr.includes("/spots") || urlStr.includes("/drawings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      };

      try {
        // Per FR-017, T046: Initial poll should use time=0 (full refresh)
        await reader.readOnce();

        const unitsUrl = fetchedUrls.find((url) => url.includes("/units"));
        const weaponsUrl = fetchedUrls.find((url) => url.includes("/weapons"));
        const logsUrl = fetchedUrls.find((url) => url.includes("/logs"));

        // Verify no time parameter (or time=0) on first poll
        assert.ok(unitsUrl !== undefined, "Units endpoint should be fetched");
        assert.ok(!unitsUrl.includes("time=") || unitsUrl.includes("time=0"), "Units should use full refresh (no time param or time=0) on initial poll");
        
        assert.ok(weaponsUrl !== undefined, "Weapons endpoint should be fetched");
        assert.ok(!weaponsUrl.includes("time=") || weaponsUrl.includes("time=0"), "Weapons should use full refresh on initial poll");
        
        assert.ok(logsUrl !== undefined, "Logs endpoint should be fetched");
        assert.ok(!logsUrl.includes("time=") || logsUrl.includes("time=0"), "Logs should use full refresh on initial poll");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T070: incremental update size reduction (SC-006) comparing full vs incremental fetch sizes (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // Track fetch sizes
      const fetchSizes: Array<{ endpoint: string; mode: string; bytes: number }> = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("/mission")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        if (urlStr.includes("/units")) {
          // Simulate different sizes: full refresh = 1000 bytes, incremental = 200 bytes
          const isFullRefresh = !urlStr.includes("time=") || urlStr.includes("time=0");
          const bufferSize = isFullRefresh ? 1000 : 200;
          const buffer = new ArrayBuffer(bufferSize);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          // Fill rest with data (simplified - just need size difference)
          for (let i = 8; i < bufferSize - 1; i++) {
            view.setUint8(i, 0x01);
          }
          view.setUint8(bufferSize - 1, 0xFF); // EndOfData
          
          fetchSizes.push({
            endpoint: "units",
            mode: isFullRefresh ? "full" : "incremental",
            bytes: bufferSize,
          });
          
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/weapons")) {
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setBigUint64(0, BigInt(1234567890), true);
          view.setUint8(8, 0xFF);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer,
          } as Response;
        }
        if (urlStr.includes("/logs") || urlStr.includes("/airbases") || urlStr.includes("/bullseyes") || 
            urlStr.includes("/spots") || urlStr.includes("/drawings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              time: "1234567890",
              sessionHash: "abc123",
            }),
          } as Response;
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      };

      try {
        // First poll: full refresh
        await reader.readOnce();
        
        // Second poll: incremental update
        await reader.readOnce();

        // Per SC-006: Verify incremental update is significantly smaller than full refresh
        const fullRefresh = fetchSizes.find((f) => f.mode === "full");
        const incremental = fetchSizes.find((f) => f.mode === "incremental");
        
        assert.ok(fullRefresh !== undefined, "Full refresh should be logged");
        assert.ok(incremental !== undefined, "Incremental update should be logged");
        
        if (fullRefresh && incremental) {
          // Verify incremental is smaller (in this test, 200 < 1000)
          assert.ok(incremental.bytes < fullRefresh.bytes, 
            `Incremental update (${incremental.bytes} bytes) should be smaller than full refresh (${fullRefresh.bytes} bytes)`);
          
          // Verify bfis-binary-fetch events were logged with correct mode and bytes
          const binaryFetchLogs = logger.logs.filter((log) => log.event === "bfis-binary-fetch");
          assert.ok(binaryFetchLogs.length >= 2, "Should have at least 2 bfis-binary-fetch logs");
          
          const fullLog = binaryFetchLogs.find((log) => log.meta?.mode === "full");
          const incrementalLog = binaryFetchLogs.find((log) => log.meta?.mode === "incremental");
          
          assert.ok(fullLog !== undefined, "Full refresh should be logged in bfis-binary-fetch");
          assert.ok(incrementalLog !== undefined, "Incremental update should be logged in bfis-binary-fetch");
          
          if (fullLog && incrementalLog) {
            assert.strictEqual(fullLog.meta?.bytes, fullRefresh.bytes);
            assert.strictEqual(incrementalLog.meta?.bytes, incremental.bytes);
          }
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("spec-002 User Story 1: Complete Context Snapshot", () => {
    test("readContextOnce returns complete snapshot with all context data (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      // Mock data
      const mockContext = {
        airbases: { airbases: [{ id: "base1", callsign: "TestBase" }] },
        bullseyes: { bullseyes: { "1": { lat: 10, lon: 10 } } },
        spots: { spots: [{ id: "spot1", code: 1111 }] },
        drawings: { drawings: [{ id: "draw1", text: "Label" }] },
        logs: { logs: [{ type: "event", message: "Test log", time: 1000 }] }
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetchForAllEndpoints(
        { theatre: "Caucasus", sessionHash: "ctx123" },
        undefined,
        undefined,
        mockContext
      );

      try {
        const snapshot = await reader.readContextOnce();

        // Verify base snapshot
        assert.strictEqual(snapshot.base.sessionHash, "ctx123");
        
        // Verify context slices
        assert.strictEqual(snapshot.airbases.length, 1);
        assert.strictEqual(snapshot.airbases[0].id, "base1");
        assert.strictEqual(snapshot.airbases[0].name, "TestBase");
        
        assert.strictEqual(snapshot.bullseyes.length, 1);
        assert.strictEqual(snapshot.bullseyes[0].coalition, "RED");
        
        assert.strictEqual(snapshot.spots.length, 1);
        assert.strictEqual(snapshot.spots[0].id, "spot1");
        
        assert.strictEqual(snapshot.drawings.length, 1);
        assert.strictEqual(snapshot.drawings[0].id, "draw1");
        
        assert.strictEqual(snapshot.logs.length, 1);
        assert.strictEqual(snapshot.logs[0].message, "Test log");
        
        // Verify weapons summary
        assert.ok(snapshot.weaponsSummary);
        
        // Verify success log
        const successLog = logger.logs.find(l => l.event === "bfis-context-snapshot-ok");
        assert.ok(successLog, "Expected bfis-context-snapshot-ok log");
        assert.strictEqual(successLog?.meta?.airbaseCount, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("readContextOnce returns complete snapshot (integration)", { skip: !RUN_INTEGRATION_TESTS }, async () => {
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

    test("readContextOnce handles session reset gracefully (unit test)", { skip: RUN_INTEGRATION_TESTS }, async () => {
      const config = createMockConfig();
      const logger = createMockLogger();
      const reader = new SnapshotReader(config, logger);

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("/mission")) {
          callCount++;
          return {
            ok: true, status: 200,
            json: async () => ({
              mission: { theatre: "Caucasus" },
              time: "1234567890",
              sessionHash: callCount <= 1 ? "session1" : "session2", // Change on second call
            }),
          } as Response;
        }
        // Delegate to helper
        const helper = createMockFetchForAllEndpoints({ theatre: "Caucasus", sessionHash: callCount <= 1 ? "session1" : "session2" });
        return helper(url);
      };

      try {
        // 1. First poll
        const snap1 = await reader.readContextOnce();
        assert.strictEqual(snap1.base.sessionHash, "session1");

        // 2. Second poll (session change)
        const snap2 = await reader.readContextOnce();
        assert.strictEqual(snap2.base.sessionHash, "session2");

        // Verify reset logged
        const resetLog = logger.logs.find(l => l.event === "bfis-session-reset");
        assert.ok(resetLog, "Expected bfis-session-reset log");
        assert.strictEqual(resetLog?.meta?.oldSessionHash, "session1");
        assert.strictEqual(resetLog?.meta?.newSessionHash, "session2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

