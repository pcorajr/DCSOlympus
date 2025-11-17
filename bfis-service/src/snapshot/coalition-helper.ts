/**
 * Coalition conversion utilities for binary data decoding.
 * 
 * Converts between Olympus binary format coalition enum values (uint8)
 * and the shared schema OlympusCoalition type.
 * 
 * The Olympus binary format uses numeric coalition IDs:
 * - 0: NEUTRAL
 * - 1: RED
 * - 2: BLUE
 * 
 * The shared schema uses string literals: "BLUE", "RED", "NEUTRAL", "UNKNOWN"
 * 
 * This mirrors the Olympus frontend pattern from
 * `frontend/react/src/other/utils.ts:321` but uses uppercase coalition names
 * to match the shared schema type.
 * 
 * @see OlympusCoalition
 * @see DataExtractor.extractUInt8
 */
import type { OlympusCoalition } from "../../../shared-schemas/index.js";

/**
 * Convert Olympus binary format coalition enum (uint8) to OlympusCoalition type.
 * 
 * @param coalitionID - Numeric coalition ID from binary format (0=NEUTRAL, 1=RED, 2=BLUE)
 * @returns OlympusCoalition string literal, or "UNKNOWN" if coalitionID is invalid
 * 
 * @example
 * ```typescript
 * const coalitionId = dataExtractor.extractUInt8();
 * const coalition = enumToCoalition(coalitionId); // "BLUE" | "RED" | "NEUTRAL" | "UNKNOWN"
 * ```
 */
export function enumToCoalition(coalitionID: number): OlympusCoalition {
  switch (coalitionID) {
    case 0:
      return "NEUTRAL";
    case 1:
      return "RED";
    case 2:
      return "BLUE";
    default:
      return "UNKNOWN";
  }
}

/**
 * Convert OlympusCoalition type to Olympus binary format coalition enum (uint8).
 * 
 * @param coalition - Coalition string literal from shared schema
 * @returns Numeric coalition ID (0=NEUTRAL, 1=RED, 2=BLUE), or 0 for UNKNOWN/invalid
 * 
 * @example
 * ```typescript
 * const coalitionId = coalitionToEnum("BLUE"); // 2
 * ```
 */
export function coalitionToEnum(coalition: OlympusCoalition): number {
  switch (coalition) {
    case "NEUTRAL":
      return 0;
    case "RED":
      return 1;
    case "BLUE":
      return 2;
    case "UNKNOWN":
    default:
      return 0; // Default to NEUTRAL for UNKNOWN
  }
}

