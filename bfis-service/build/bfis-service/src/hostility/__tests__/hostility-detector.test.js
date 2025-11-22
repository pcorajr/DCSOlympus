/**
 * Tests for HostilityDetector class.
 *
 * Tests cover:
 * - Empty weapon cache scenario
 * - Weapon detection scenario
 * - Multiple weapons earliest timestamp scenario
 * - Session hash change reset scenario
 * - One-time detection principle (flag stays true)
 * - Missing/invalid session hash handling
 *
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
 *
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     bfis-service \
 *     node --test build/src/hostility/__tests__/hostility-detector.test.js
 *
 * DO NOT run tests directly on host - use Docker container only.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HostilityDetector } from "../hostility-detector.js";
/**
 * Helper to create a mock DecodedWeapon for testing.
 */
function createMockWeapon(weaponId, updateTime, alive = true) {
    return {
        weaponId,
        category: "Missile",
        alive,
        coalition: "RED",
        name: "SA-10",
        position: { lat: 0, lng: 0, alt: 0 },
        speed: 0,
        heading: 0,
        updateTime,
    };
}
describe("HostilityDetector", () => {
    describe("detect", () => {
        test("returns false when weapon cache is empty", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            const result = detector.detect(weaponCache, "session1");
            assert.strictEqual(result.hostilitiesStarted, false);
            assert.strictEqual(result.hostilitiesStartTime, undefined);
            assert.strictEqual(result.sessionHash, "session1");
        });
        test("detects hostilities when weapon cache has weapons", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 1000));
            const result = detector.detect(weaponCache, "session1");
            assert.strictEqual(result.hostilitiesStarted, true);
            assert.strictEqual(result.hostilitiesStartTime, 1000);
            assert.strictEqual(result.sessionHash, "session1");
        });
        test("uses earliest weapon timestamp when multiple weapons exist", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 2000));
            weaponCache.set(2, createMockWeapon(2, 1000)); // Earliest
            weaponCache.set(3, createMockWeapon(3, 3000));
            const result = detector.detect(weaponCache, "session1");
            assert.strictEqual(result.hostilitiesStarted, true);
            assert.strictEqual(result.hostilitiesStartTime, 1000); // Earliest timestamp
        });
        test("counts destroyed weapons (alive: false) as hostilities started", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 1000, false)); // Destroyed weapon
            const result = detector.detect(weaponCache, "session1");
            assert.strictEqual(result.hostilitiesStarted, true);
            assert.strictEqual(result.hostilitiesStartTime, 1000);
        });
        test("resets state when session hash changes", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 1000));
            // First session - hostilities detected
            const result1 = detector.detect(weaponCache, "session1");
            assert.strictEqual(result1.hostilitiesStarted, true);
            // Second session - should reset
            const result2 = detector.detect(new Map(), "session2");
            assert.strictEqual(result2.hostilitiesStarted, false);
            assert.strictEqual(result2.hostilitiesStartTime, undefined);
            assert.strictEqual(result2.sessionHash, "session2");
        });
        test("keeps flag true even if cache becomes empty after detection", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 1000));
            // Detect hostilities
            const result1 = detector.detect(weaponCache, "session1");
            assert.strictEqual(result1.hostilitiesStarted, true);
            assert.strictEqual(result1.hostilitiesStartTime, 1000);
            // Cache becomes empty - flag should remain true
            const result2 = detector.detect(new Map(), "session1");
            assert.strictEqual(result2.hostilitiesStarted, true);
            assert.strictEqual(result2.hostilitiesStartTime, 1000); // Preserved
        });
        test("handles missing/invalid session hash (empty string)", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            // Empty string session hash - treated as new session
            const result = detector.detect(weaponCache, "");
            assert.strictEqual(result.hostilitiesStarted, false);
            assert.strictEqual(result.sessionHash, "");
        });
        test("maintains state across multiple calls with same session hash", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            weaponCache.set(1, createMockWeapon(1, 1000));
            // First call - detects hostilities
            const result1 = detector.detect(weaponCache, "session1");
            assert.strictEqual(result1.hostilitiesStarted, true);
            // Second call with same session - state persists
            const result2 = detector.detect(weaponCache, "session1");
            assert.strictEqual(result2.hostilitiesStarted, true);
            assert.strictEqual(result2.hostilitiesStartTime, 1000);
        });
        test("handles session hash change with no weapons fired yet", () => {
            const detector = new HostilityDetector();
            const weaponCache = new Map();
            // First session - no weapons
            const result1 = detector.detect(weaponCache, "session1");
            assert.strictEqual(result1.hostilitiesStarted, false);
            // Session changes - should reset and start fresh
            const result2 = detector.detect(weaponCache, "session2");
            assert.strictEqual(result2.hostilitiesStarted, false);
            assert.strictEqual(result2.sessionHash, "session2");
        });
    });
});
