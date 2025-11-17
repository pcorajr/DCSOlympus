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
 * All tests use Node.js built-in test runner and run in Docker container per AGENTS.md.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotReader } from "../snapshot-reader.js";
import { loadConfig } from "../../config/config.js";
import { createStructuredLogger } from "../../logger/structured-logger.js";
// Check if we should run integration tests (default: true)
const RUN_INTEGRATION_TESTS = process.env.INTEGRATION_TEST !== "false";
/**
 * Create a mock BfisConfig for testing.
 */
function createMockConfig() {
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
function createMockLogger() {
    const logs = [];
    return {
        logs,
        debug: (event, meta) => {
            logs.push({ event, meta });
        },
        info: (event, meta) => {
            logs.push({ event, meta });
        },
        warn: (event, meta) => {
            logs.push({ event, meta });
        },
        error: (event, meta) => {
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
            const logs = [];
            const originalInfo = logger.info.bind(logger);
            logger.info = (event, meta) => {
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
                };
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
            }
            finally {
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
                };
            };
            try {
                await assert.rejects(async () => {
                    await reader.probeMissionOnce();
                }, {
                    message: /Olympus mission probe failed: 401/,
                });
            }
            finally {
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
            const logs = [];
            const originalInfo = logger.info.bind(logger);
            logger.info = (event, meta) => {
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
            assert.strictEqual(snapshot.units.length, 0, "units should be empty for User Story 1");
            // Verify log was called
            const readLog = logs.find((log) => log.event === "bfis-snapshot-read-ok");
            assert.ok(readLog !== undefined, "Expected bfis-snapshot-read-ok log event");
            if (readLog) {
                assert.strictEqual(readLog.meta?.snapshotId, snapshot.snapshotId);
                assert.strictEqual(readLog.meta?.sessionHash, snapshot.sessionHash);
                assert.strictEqual(readLog.meta?.unitCount, 0);
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
            // Mock fetch to return mission response
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async (url) => {
                const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
                if (urlStr.includes("/mission")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            mission: {
                                theatre: "Caucasus",
                            },
                            time: "1234567890",
                            sessionHash: "abc123",
                        }),
                    };
                }
                throw new Error(`Unexpected URL: ${urlStr}`);
            };
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
            }
            finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
