/**
 * Weapon binary decoder for Olympus weapons endpoint.
 * 
 * This module provides high-level decoding of binary weapon data from the
 * `/olympus/weapons` endpoint. It uses the low-level `DataExtractor` to
 * parse the binary buffer and convert it into structured weapon objects.
 * 
 * Binary format:
 * - First 8 bytes: `uint64` updateTime (milliseconds since epoch)
 * - Remaining bytes: Variable-length weapon data encoded using `DataIndexes`
 * 
 * Decoding pattern (mirrors Olympus frontend):
 * 1. Extract updateTime (first 8 bytes)
 * 2. Loop through buffer extracting weapon IDs and data fields
 * 3. For each weapon, extract fields via DataIndexes switch statement
 * 
 * Note: Weapons are not part of the MVP OlympusSnapshot (only units are),
 * but this decoder is created for future use and consistency with the
 * Olympus frontend pattern.
 * 
 * @see DataExtractor
 * @see DataIndexes
 * @see frontend/react/src/weapon/weaponsmanager.ts:58-89
 */

import { DataExtractor } from "./binary-decoder.js";
import { DataIndexes } from "./data-indexes.js";

/**
 * Decode binary weapons buffer into structured weapon data.
 * 
 * Extracts the leading updateTime and decodes all weapon data from the buffer.
 * Returns updateTime and weapon data (structure TBD based on future requirements).
 * 
 * @param buffer - Binary ArrayBuffer from `/olympus/weapons` endpoint
 * @returns Object containing updateTime (milliseconds) and weapon data
 * 
 * @example
 * ```typescript
 * const { updateTime, weapons } = decodeWeapons(buffer);
 * ```
 */
export function decodeWeapons(buffer: ArrayBuffer): { updateTime: number; weapons: unknown[] } {
  const dataExtractor = new DataExtractor(buffer);
  
  // Extract updateTime (first 8 bytes, uint64)
  const updateTime = Number(dataExtractor.extractUInt64());
  
  // For MVP, weapons are not fully decoded - return empty array
  // Full weapon decoding would follow the same pattern as units:
  // - Loop extracting weapon IDs
  // - Extract weapon data fields via DataIndexes switch
  // - Convert to weapon objects
  // This is deferred to post-MVP as weapons are not part of OlympusSnapshot in MVP
  
  const weapons: unknown[] = [];
  
  return {
    updateTime,
    weapons,
  };
}

