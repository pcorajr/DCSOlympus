/**
 * Tests for unit binary decoder.
 *
 * Tests cover:
 * - decodeUnits: extraction of updateTime and unit data from binary buffers
 * - Handling of empty buffers
 * - Extraction of unit fields (unitId, category, coalition, position, etc.)
 *
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
 *
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     bfis-service \
 *     node --test build/src/snapshot/__tests__/unit-decoder.test.js
 *
 * DO NOT run tests directly on host - use Docker container only.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeUnits, convertLatLngToPosition } from "../unit-decoder.js";
import { DataIndexes } from "../data-indexes.js";
/**
 * Helper to create a minimal binary buffer with updateTime and a single unit.
 *
 * Format:
 * - Bytes 0-7: uint64 updateTime (little-endian)
 * - Bytes 8-11: uint32 unitId
 * - Bytes 12: uint8 datumIndex (category)
 * - Bytes 13-14: uint16 stringLength
 * - Bytes 15+: string data (category name)
 * - ... more datumIndex + value pairs
 * - Final byte: 255 (endOfData)
 */
function createTestBuffer(updateTime, unitData) {
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, updateTime, true); // little-endian
    const combined = new Uint8Array(timeBuffer.byteLength + unitData.byteLength);
    combined.set(new Uint8Array(timeBuffer), 0);
    combined.set(new Uint8Array(unitData), timeBuffer.byteLength);
    return combined.buffer;
}
/**
 * Helper to encode a unit ID followed by category.
 */
function encodeUnitWithCategory(unitId, category) {
    const categoryBytes = new TextEncoder().encode(category);
    const buffer = new ArrayBuffer(4 + 1 + 2 + categoryBytes.length + 1);
    const view = new DataView(buffer);
    let offset = 0;
    // unitId (uint32)
    view.setUint32(offset, unitId, true);
    offset += 4;
    // datumIndex = category
    view.setUint8(offset, DataIndexes.category);
    offset += 1;
    // string length (uint16)
    view.setUint16(offset, categoryBytes.length, true);
    offset += 2;
    // string data
    new Uint8Array(buffer).set(categoryBytes, offset);
    offset += categoryBytes.length;
    // endOfData marker
    view.setUint8(offset, DataIndexes.endOfData);
    return buffer;
}
describe("unit-decoder", () => {
    describe("decodeUnits", () => {
        test("extracts updateTime from buffer", () => {
            const updateTime = BigInt(Date.now());
            const unitData = encodeUnitWithCategory(12345, "Aircraft");
            const buffer = createTestBuffer(updateTime, unitData);
            const result = decodeUnits(buffer);
            assert.strictEqual(result.updateTime, Number(updateTime));
            assert.ok(Array.isArray(result.units));
        });
        test("extracts unitId, category, coalition, position from buffer", () => {
            const updateTime = BigInt(Date.now());
            // Create a more complete unit buffer
            const category = "Aircraft";
            const categoryBytes = new TextEncoder().encode(category);
            const coalition = 2; // BLUE
            const lat = 36.1699;
            const lng = -115.1398;
            const alt = 1000.0;
            const threshold = 0.0;
            const unitId = 12345;
            const unitName = "F-16C";
            // Build buffer: unitId + category + coalition + position + name + endOfData
            const bufferSize = 4 + // unitId
                1 + 2 + categoryBytes.length + // category
                1 + 1 + // coalition (datumIndex + uint8)
                1 + 8 + 8 + 8 + 8 + // position (datumIndex + 4 floats)
                1 + 2 + 5 + // name (datumIndex + length + "F-16C")
                1; // endOfData
            const buffer = new ArrayBuffer(8 + bufferSize);
            const view = new DataView(buffer);
            let offset = 0;
            // updateTime (uint64)
            view.setBigUint64(offset, updateTime, true);
            offset += 8;
            // unitId (uint32)
            view.setUint32(offset, unitId, true);
            offset += 4;
            // category
            view.setUint8(offset, DataIndexes.category);
            offset += 1;
            view.setUint16(offset, categoryBytes.length, true);
            offset += 2;
            new Uint8Array(buffer).set(categoryBytes, offset);
            offset += categoryBytes.length;
            // coalition
            view.setUint8(offset, DataIndexes.coalition);
            offset += 1;
            view.setUint8(offset, coalition);
            offset += 1;
            // position
            view.setUint8(offset, DataIndexes.position);
            offset += 1;
            view.setFloat64(offset, lat, true);
            offset += 8;
            view.setFloat64(offset, lng, true);
            offset += 8;
            view.setFloat64(offset, alt, true);
            offset += 8;
            view.setFloat64(offset, threshold, true);
            offset += 8;
            // name
            const nameBytes = new TextEncoder().encode(unitName);
            view.setUint8(offset, DataIndexes.name);
            offset += 1;
            view.setUint16(offset, nameBytes.length, true);
            offset += 2;
            new Uint8Array(buffer).set(nameBytes, offset);
            offset += nameBytes.length;
            // endOfData
            view.setUint8(offset, DataIndexes.endOfData);
            const result = decodeUnits(buffer);
            assert.strictEqual(result.units.length, 1);
            const unit = result.units[0];
            assert.strictEqual(unit.unitId, String(unitId));
            assert.strictEqual(unit.category, category);
            assert.strictEqual(unit.coalition, "BLUE");
            assert.strictEqual(unit.position.lat, lat);
            assert.strictEqual(unit.position.lon, lng);
            assert.strictEqual(unit.position.altMeters, alt);
            assert.strictEqual(unit.name, unitName);
        });
        test("handles empty buffer gracefully", () => {
            // Buffer with only updateTime (8 bytes), no units
            const updateTime = BigInt(Date.now());
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            view.setBigUint64(0, updateTime, true);
            const result = decodeUnits(buffer);
            assert.strictEqual(result.updateTime, Number(updateTime));
            assert.strictEqual(result.units.length, 0);
        });
        test("handles buffer with only updateTime and endOfData", () => {
            const updateTime = BigInt(Date.now());
            const buffer = new ArrayBuffer(9); // 8 bytes updateTime + 1 byte endOfData
            const view = new DataView(buffer);
            view.setBigUint64(0, updateTime, true);
            view.setUint8(8, DataIndexes.endOfData);
            const result = decodeUnits(buffer);
            assert.strictEqual(result.updateTime, Number(updateTime));
            assert.strictEqual(result.units.length, 0);
        });
    });
    describe("convertLatLngToPosition", () => {
        test("converts BfisLatLng to OlympusUnitPosition", () => {
            const latLng = {
                lat: 36.1699,
                lng: -115.1398,
                alt: 1000.0,
                threshold: 0.0,
            };
            const position = convertLatLngToPosition(latLng);
            assert.strictEqual(position.lat, latLng.lat);
            assert.strictEqual(position.lon, latLng.lng);
            assert.strictEqual(position.altMeters, latLng.alt);
            // threshold should not be in result
            assert.strictEqual("threshold" in position, false);
        });
        test("handles missing threshold field", () => {
            const latLng = {
                lat: 36.1699,
                lng: -115.1398,
                alt: 1000.0,
            };
            const position = convertLatLngToPosition(latLng);
            assert.strictEqual(position.lat, latLng.lat);
            assert.strictEqual(position.lon, latLng.lng);
            assert.strictEqual(position.altMeters, latLng.alt);
        });
    });
});
