/**
 * Unit binary decoder for Olympus units endpoint.
 * 
 * This module provides high-level decoding of binary unit data from the
 * `/olympus/units` endpoint. It uses the low-level `DataExtractor` to
 * parse the binary buffer and convert it into structured `OlympusUnit` objects.
 * 
 * Binary format:
 * - First 8 bytes: `uint64` updateTime (milliseconds since epoch)
 * - Remaining bytes: Variable-length unit data encoded using `DataIndexes`
 * 
 * Decoding pattern (mirrors Olympus frontend):
 * 1. Extract updateTime (first 8 bytes)
 * 2. Loop through buffer extracting unit IDs and data fields
 * 3. For each unit, extract fields via DataIndexes switch statement
 * 4. Convert internal types (BfisLatLng) to shared schema types (OlympusUnitPosition)
 * 
 * @see DataExtractor
 * @see DataIndexes
 * @see OlympusUnit
 * @see frontend/react/src/unit/unitsmanager.ts:234-266
 */

import { DataExtractor } from "./binary-decoder.js";
import { DataIndexes } from "./data-indexes.js";
import { enumToCoalition } from "./coalition-helper.js";
import type { OlympusUnit } from "../../../shared-schemas/index.js";
import type { BfisLatLng } from "../types/internal.js";

/**
 * Decode binary units buffer into array of OlympusUnit objects.
 * 
 * Extracts the leading updateTime and decodes all unit data from the buffer.
 * Returns an array of units with all required fields populated.
 * 
 * @param buffer - Binary ArrayBuffer from `/olympus/units` endpoint
 * @returns Object containing updateTime (milliseconds) and units array
 * 
 * @example
 * ```typescript
 * const { updateTime, units } = decodeUnits(buffer);
 * // units is OlympusUnit[]
 * ```
 */
export function decodeUnits(buffer: ArrayBuffer): { updateTime: number; units: OlympusUnit[] } {
  // TODO: Implement full decoding logic in User Story 2
  // This is a placeholder structure for Phase 2
  
  const dataExtractor = new DataExtractor(buffer);
  
  // Extract updateTime (first 8 bytes)
  const updateTime = Number(dataExtractor.extractUInt64());
  
  // TODO: Implement unit decoding loop
  // while (dataExtractor.getSeekPosition() < buffer.byteLength) {
  //   const unitId = dataExtractor.extractUInt32();
  //   // ... decode unit data using DataIndexes switch
  // }
  
  return {
    updateTime,
    units: [], // Placeholder - will be implemented in User Story 2
  };
}

/**
 * Convert BfisLatLng (internal type) to OlympusUnitPosition (shared schema).
 * 
 * This conversion is needed because the binary decoder returns BfisLatLng
 * (which includes an optional threshold field), but the shared schema
 * uses OlympusUnitPosition (which only has lat, lon, altMeters).
 * 
 * @param latLng - Internal BfisLatLng from binary decoder
 * @returns OlympusUnitPosition for shared schema
 */
export function convertLatLngToPosition(latLng: BfisLatLng): { lat: number; lon: number; altMeters: number } {
  return {
    lat: latLng.lat,
    lon: latLng.lng,
    altMeters: latLng.alt,
  };
}

