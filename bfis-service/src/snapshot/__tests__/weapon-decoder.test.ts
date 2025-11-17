/**
 * Tests for weapon binary decoder.
 * 
 * Tests cover:
 * - decodeWeapons: extraction of updateTime and weapon data from binary buffers
 * - Handling of empty buffers
 * 
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
 * 
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     bfis-service \
 *     node --test build/src/snapshot/__tests__/weapon-decoder.test.js
 * 
 * DO NOT run tests directly on host - use Docker container only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeWeapons } from "../weapon-decoder.js";

describe("weapon-decoder", () => {
  describe("decodeWeapons", () => {
    test("extracts updateTime from buffer", () => {
      const updateTime = BigInt(Date.now());
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setBigUint64(0, updateTime, true);

      const result = decodeWeapons(buffer);

      assert.strictEqual(result.updateTime, Number(updateTime));
      assert.ok(Array.isArray(result.weapons));
    });

    test("handles empty buffer gracefully", () => {
      // Buffer with only updateTime (8 bytes), no weapons
      const updateTime = BigInt(Date.now());
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setBigUint64(0, updateTime, true);

      const result = decodeWeapons(buffer);

      assert.strictEqual(result.updateTime, Number(updateTime));
      assert.strictEqual(result.weapons.length, 0);
    });
  });
});

