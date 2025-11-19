import { describe, test, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAirbases,
  normalizeBullseyes,
  normalizeSpots,
  normalizeDrawings,
  normalizeLogs,
  buildWeaponsSummary
} from "../normalizers.js";

describe("Context Normalizers", () => {
  
  describe("normalizeAirbases", () => {
    it("normalizes valid airbase data and sorts by ID", () => {
      const raw = {
        airbases: [
          { id: "2", callsign: "Batumi", coalition: "BLUE", lat: 41.6, lon: 41.6 },
          { id: "1", callsign: "Kobuleti", coalition: "RED", lat: 41.8, lon: 41.8 }
        ]
      };
      
      const result = normalizeAirbases(raw);
      
      assert.equal(result.length, 2);
      assert.equal(result[0].id, "1");
      assert.equal(result[0].name, "Kobuleti");
      assert.equal(result[0].coalition, "RED");
      
      assert.equal(result[1].id, "2");
      assert.equal(result[1].name, "Batumi");
      assert.equal(result[1].coalition, "BLUE");
    });

    it("handles missing optional fields gracefully", () => {
      const raw = {
        airbases: [{ id: "1" }] // Minimal
      };
      const result = normalizeAirbases(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, "1");
      assert.equal(result[0].name, undefined);
    });

    it("skips entries missing critical ID field", () => {
      const raw = {
        airbases: [{ name: "Invalid Base" }]
      };
      const result = normalizeAirbases(raw);
      assert.equal(result.length, 0);
    });

    it("returns empty array for malformed input", () => {
      assert.deepEqual(normalizeAirbases(null), []);
      assert.deepEqual(normalizeAirbases({}), []);
      assert.deepEqual(normalizeAirbases({ airbases: "not-array" }), []);
    });
  });

  describe("normalizeBullseyes", () => {
    it("converts object map to sorted array", () => {
      const raw = {
        "2": { latitude: 42.0, longitude: 42.0 }, // Blue
        "1": { lat: 41.0, lon: 41.0 },            // Red
        "time": 123456,
        "sessionHash": "abc"
      };

      const result = normalizeBullseyes(raw);
      
      assert.equal(result.length, 2);
      // Sorted by ID: bullseye-1, bullseye-2
      
      assert.equal(result[0].id, "bullseye-1");
      assert.equal(result[0].coalition, "RED");
      assert.equal(result[0].position?.lat, 41.0);

      assert.equal(result[1].id, "bullseye-2");
      assert.equal(result[1].coalition, "BLUE");
      assert.equal(result[1].position?.lat, 42.0);
    });
  });

  describe("normalizeSpots", () => {
    it("normalizes spots and filters invalid ones", () => {
      // Olympus returns object format: { spots: { "id": {...}, ... } }
      const raw = {
        spots: {
          "2": { type: "laser", code: 1688, targetPosition: { lat: 10, lng: 10 } },
          "3": { type: "infrared", targetPosition: { lat: 20, lng: 20 } },
          "4": { type: "laser", code: 1111, targetPosition: { lat: 30, lng: 30 } }
        }
      };

      const result = normalizeSpots(raw);
      
      assert.equal(result.length, 3);
      // Sorted by ID: "2", "3", "4"
      
      assert.equal(result[0].id, "2");
      assert.equal(result[0].type, "laser");
      assert.equal(result[0].position?.lat, 10);
      assert.equal(result[0].position?.lon, 10);
      
      assert.equal(result[1].id, "3");
      assert.equal(result[1].type, "infrared");
      assert.equal(result[1].position?.lat, 20);
      
      assert.equal(result[2].id, "4");
      assert.equal(result[2].type, "laser");
    });

    it("handles array format (future-proofing)", () => {
      const raw = {
        spots: [
          { id: "spot-1", type: "laser", lat: 10, lon: 10, code: 1688 },
          { code: 1111, type: "infrared", lat: 20, lon: 20 }
        ]
      };

      const result = normalizeSpots(raw);
      
      assert.equal(result.length, 2);
      assert.equal(result[0].id, "1111");
      assert.equal(result[1].id, "spot-1");
    });
  });

  describe("normalizeDrawings", () => {
    it("normalizes drawings", () => {
      // Olympus returns nested structure: drawings -> layer -> coalition -> entries
      const raw = {
        drawings: {
          navpoints: {
            blue: {
              "draw-1": { text: "Label 1", lat: 10, lon: 20 },
              "Zone A": { name: "Zone A", points: [] }
            }
          }
        }
      };

      const result = normalizeDrawings(raw);
      
      assert.equal(result.length, 2);
      // Sorted by ID: "Zone A" vs "draw-1"
      
      const zone = result.find(d => d.id === "Zone A");
      assert.ok(zone);
      assert.equal(zone.label, "Zone A"); // Uses name as label

      const draw1 = result.find(d => d.id === "draw-1");
      assert.ok(draw1);
      assert.equal(draw1.label, "Label 1");
    });
  });

  describe("normalizeLogs", () => {
    it("normalizes logs and generates IDs if missing", () => {
      const raw = {
        logs: [
          { type: "shot", message: "Shot fired", time: 1000 },
          { id: "stable-id", type: "hit", message: "Hit", time: 2000 }
        ]
      };

      const result = normalizeLogs(raw);
      
      assert.equal(result.length, 2);
      
      const stable = result.find(l => l.id === "stable-id");
      assert.ok(stable);
      assert.equal(stable.timestamp, 2000);

      const generated = result.find(l => l.id !== "stable-id");
      assert.ok(generated);
      assert.equal(generated.message, "Shot fired");
      assert.ok(generated.id.length > 0); // UUID generated
    });
  });

  describe("buildWeaponsSummary", () => {
    it("summarizes weapon list", () => {
      const weapons = [
        { id: 1, updateTime: 100 },
        { id: 2, updateTime: 200 },
        { id: 3, updateTime: 150 }
      ];

      const summary = buildWeaponsSummary(weapons);
      
      assert.equal(summary.activeCount, 3);
      assert.equal(summary.lastUpdateTime, 200);
    });

    it("handles empty/null input", () => {
      const s1 = buildWeaponsSummary([]);
      assert.equal(s1.activeCount, 0);
      assert.equal(s1.lastUpdateTime, 0);

      const s2 = buildWeaponsSummary(null);
      assert.equal(s2.activeCount, 0);
    });
  });
});

