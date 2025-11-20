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
import { DATA_INDEX_TYPES, skipDataByType } from "./data-index-types.js";
import { debugBufferContents } from "./debug-buffer.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { OlympusUnit } from "../../../shared-schemas/index.js";
import type { BfisLatLng } from "../types/internal.js";

/**
 * Decode binary units buffer into array of OlympusUnit objects.
 * 
 * Extracts the leading updateTime and decodes all unit data from the buffer.
 * Returns an array of units with all required fields populated.
 * 
 * @param buffer - Binary ArrayBuffer from `/olympus/units` endpoint
 * @param logger - Optional structured logger for emitting decode events and warnings
 * @returns Object containing updateTime (milliseconds) and units array
 * 
 * @example
 * ```typescript
 * const { updateTime, units } = decodeUnits(buffer, logger);
 * // units is OlympusUnit[]
 * ```
 */
export function decodeUnits(buffer: ArrayBuffer, logger?: StructuredLogger): { updateTime: number; units: OlympusUnit[] } {
  const dataExtractor = new DataExtractor(buffer);
  
  // Extract updateTime (first 8 bytes, uint64)
  const updateTime = Number(dataExtractor.extractUInt64());
  
  // Debug: Log buffer contents if DEBUG_UNIT_BUFFER env var is set
  if (process.env.DEBUG_UNIT_BUFFER === "true") {
    console.log(`[DEBUG] decodeUnits: buffer size=${buffer.byteLength}, updateTime=${updateTime}`);
    debugBufferContents(buffer);
  }
  
  const units: OlympusUnit[] = [];
  
  // Loop through buffer extracting units
  // Pattern matches working decoder: decode each unit independently, no state tracking
  // Delta encoding means we only get fields that changed - decode whatever is present
  while (dataExtractor.getSeekPosition() + 4 <= buffer.byteLength) {
    // Extract unit ID (uint32)
    const posBeforeUnitId = dataExtractor.getSeekPosition();
    const unitIdNum = dataExtractor.extractUInt32();
    
    // Debug: Log unit ID and position
    if (process.env.DEBUG_UNIT_BUFFER === "true") {
      console.log(`[DEBUG] Reading unit ID ${unitIdNum} at position ${posBeforeUnitId}, buffer size: ${buffer.byteLength}`);
    }
    
    // Initialize unit with defaults - will be populated from buffer fields
    const unit: Partial<OlympusUnit> = {
      unitId: String(unitIdNum),
      coalition: "UNKNOWN",
      position: { lat: 0, lon: 0, altMeters: 0 },
      human: false,
      controlled: false,
    };
    
    // Extract data fields until endOfData
    // Field order is NOT guaranteed - delta encoding sends only changed fields
    fieldLoop: while (dataExtractor.getSeekPosition() < buffer.byteLength) {
      const datumIndex = dataExtractor.extractUInt8();
      
      // Check for EndOfData marker (0xFF)
      if (datumIndex === DataIndexes.endOfData) {
        break fieldLoop;
      }
      
      try {
        switch (datumIndex) {
          case DataIndexes.startOfData:
            // Skip startOfData marker (0)
            break;
          
          case DataIndexes.category:
            const category = dataExtractor.extractString();
            unit.category = category;
            // Default unitType to category only if name and unitName not present
            // name is the primary source, so don't override it
            if (!unit.unitType) {
              unit.unitType = category;
            }
            break;
          
          case DataIndexes.alive:
            // Skip alive field (not needed for snapshot)
            dataExtractor.extractBool();
            break;
          
          case DataIndexes.alarmState:
            // Skip alarmState (uint8)
            dataExtractor.extractUInt8();
            break;
          
          case DataIndexes.radarState:
            // Skip radarState (bool)
            dataExtractor.extractBool();
            break;
          
          case DataIndexes.human:
            unit.human = dataExtractor.extractBool();
            break;
          
          case DataIndexes.controlled:
            unit.controlled = dataExtractor.extractBool();
            break;
          
          case DataIndexes.coalition:
            const coalitionNum = dataExtractor.extractUInt8();
            unit.coalition = enumToCoalition(coalitionNum);
            break;
          
          case DataIndexes.country:
            // Skip country (uint8, not needed for snapshot)
            dataExtractor.extractUInt8();
            break;
          
          case DataIndexes.name:
            // CRITICAL: name is the canonical unit type field (not unitName)
            // This matches the working decoder pattern: fields.name is the unit type
            const name = dataExtractor.extractString();
            unit.name = name;
            unit.unitType = name; // Use name as unitType (primary source)
            break;
          
          case DataIndexes.unitName:
            // unitName is a fallback/secondary field
            const unitName = dataExtractor.extractString();
            // Only use unitName if name wasn't already set
            if (!unit.unitType) {
              unit.unitType = unitName;
            }
            break;
          
          case DataIndexes.callsign:
            // Skip callsign (not needed for snapshot)
            dataExtractor.extractString();
            break;
          
          case DataIndexes.unitID:
            const unitIdFromData = dataExtractor.extractUInt32();
            unit.unitId = String(unitIdFromData);
            break;
          
          case DataIndexes.groupID:
            const groupIdNum = dataExtractor.extractUInt32();
            unit.groupId = String(groupIdNum);
            break;
          
          case DataIndexes.position:
            const latLng = dataExtractor.extractLatLng();
            unit.position = convertLatLngToPosition(latLng);
            break;
          
          case DataIndexes.state:
            const stateNum = dataExtractor.extractUInt8();
            // Convert state enum to string (simplified - full implementation would use enumToState)
            unit.status = String(stateNum);
            break;
          
          default:
            // Unknown datumIndex - skip based on type to avoid corrupting buffer
            const dataType = DATA_INDEX_TYPES[datumIndex];
            if (dataType) {
              // We know the type, skip it correctly
              skipDataByType(dataExtractor, dataType);
            } else {
              // Unknown datumIndex that's not in our mapping - search for next 0xFF marker
              // This matches the working decoder's error recovery pattern
              if (logger) {
                logger.warn("bfis-unit-decode-unknown-datum-index", {
                  datumIndex,
                  unitId: unitIdNum,
                  recovery: "searching-for-end-of-data-marker",
                });
              } else {
                console.warn(`Unknown datumIndex ${datumIndex} for unit ${unitIdNum} - searching for next EndOfData marker`);
              }
              // Find next 0xFF marker to resync (search entire remaining buffer)
              const startPos = dataExtractor.getSeekPosition();
              let found = false;
              for (let i = 0; i < buffer.byteLength - startPos; i++) {
                if (new Uint8Array(buffer)[startPos + i] === 0xFF) {
                  dataExtractor.setSeekPosition(startPos + i + 1);
                  found = true;
                  break;
                }
              }
              // When unknown DataIndex and can't find 0xFF:
              if (!found) {
                // CRITICAL: We must position for next unit ID read
                // Try to find next unit ID pattern (uint32 > 1000) as fallback
                // This matches working decoder's aggressive recovery
                let nextUnitPos = -1;
                for (let i = 0; i < Math.min(500, buffer.byteLength - startPos - 4); i++) {
                  if (startPos + i + 4 <= buffer.byteLength) {
                    const potentialId = new DataView(buffer).getUint32(startPos + i, true);
                    if (potentialId > 1000 && potentialId < 100000000) {
                      nextUnitPos = startPos + i;
                      break;
                    }
                  }
                }
                if (nextUnitPos !== -1) {
                  dataExtractor.setSeekPosition(nextUnitPos);
                  // Break from inner loop - outer loop will read next unit ID from nextUnitPos
                  break fieldLoop;
                } else {
                  // Give up on this unit - stop decoding (matches working decoder behavior)
                  if (logger) {
                    logger.warn("bfis-unit-decode-recovery-failed", {
                      unitId: unitIdNum,
                      reason: "unknown-datum-index-no-sync-point",
                    });
                  } else {
                    console.warn(`Could not recover for unit ${unitIdNum} - stopping decode`);
                  }
                  dataExtractor.setSeekPosition(buffer.byteLength); // Exit outer loop
                  break fieldLoop;
                }
              } else {
                // Found 0xFF - positioned right after it, break from inner loop
                // Outer loop will continue and read next unit ID
                if (process.env.DEBUG_UNIT_BUFFER === "true") {
                  console.log(`[DEBUG] Found 0xFF for unit ${unitIdNum}, positioned at ${dataExtractor.getSeekPosition()}, buffer size: ${buffer.byteLength}`);
                }
                break fieldLoop;
              }
            }
            break;
        }
      } catch (error) {
        // Error reading field - skip to next 0xFF marker (matches working decoder pattern)
        // CRITICAL: We must continue to next unit even if this one fails
        if (logger) {
          logger.warn("bfis-unit-decode-field-error", {
            datumIndex,
            unitId: unitIdNum,
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          });
        } else {
          console.warn(`Error reading field ${datumIndex} for unit ${unitIdNum}: ${error}`);
        }
        let found = false;
        const startPos = dataExtractor.getSeekPosition();
        // Search entire remaining buffer for EndOfData marker (matches working decoder)
        for (let i = 0; i < buffer.byteLength - startPos; i++) {
          if (new Uint8Array(buffer)[startPos + i] === 0xFF) {
            dataExtractor.setSeekPosition(startPos + i + 1);
            found = true;
            break;
          }
        }
        if (!found) {
          // CRITICAL: We must position for next unit ID read
          // Try to find next unit ID pattern (uint32 > 1000) as fallback
          // This matches working decoder's aggressive recovery
          let nextUnitPos = -1;
          for (let i = 0; i < Math.min(500, buffer.byteLength - startPos - 4); i++) {
            if (startPos + i + 4 <= buffer.byteLength) {
              const potentialId = new DataView(buffer).getUint32(startPos + i, true);
              if (potentialId > 1000 && potentialId < 100000000) {
                nextUnitPos = startPos + i;
                break;
              }
            }
          }
          if (nextUnitPos !== -1) {
            dataExtractor.setSeekPosition(nextUnitPos);
            // Break from inner loop - outer loop will read next unit ID from nextUnitPos
            break fieldLoop;
          } else {
            // Give up on this unit - stop decoding (matches working decoder behavior)
            if (logger) {
              logger.warn("bfis-unit-decode-recovery-failed", {
                unitId: unitIdNum,
                reason: "field-read-error-no-sync-point",
              });
            } else {
              console.warn(`Could not recover for unit ${unitIdNum} after error - stopping decode`);
            }
            dataExtractor.setSeekPosition(buffer.byteLength); // Exit outer loop
            break fieldLoop;
          }
        } else {
          // Found 0xFF - positioned right after it, break from inner loop
          // Outer loop will continue and read next unit ID
          if (process.env.DEBUG_UNIT_BUFFER === "true") {
            console.log(`[DEBUG] Found 0xFF after error for unit ${unitIdNum}, positioned at ${dataExtractor.getSeekPosition()}, buffer size: ${buffer.byteLength}`);
          }
          break fieldLoop;
        }
      }
    }
    
    // Ensure required fields are present before adding unit
    // Note: category may not be present in delta updates, but we still need unitId
    // CRITICAL: unitType should come from name (primary) or unitName (fallback) or category (last resort)
    if (unit.unitId) {
      if (process.env.DEBUG_UNIT_BUFFER === "true") {
        console.log(`[DEBUG] Added unit ${unit.unitId}, position after unit: ${dataExtractor.getSeekPosition()}, buffer size: ${buffer.byteLength}`);
      }
      units.push({
        unitId: unit.unitId,
        category: unit.category || "Unknown",
        coalition: unit.coalition || "UNKNOWN",
        // Priority: name (canonical) > unitName (fallback) > category (last resort)
        unitType: unit.unitType || unit.category || "Unknown",
        position: unit.position || { lat: 0, lon: 0, altMeters: 0 },
        groupId: unit.groupId,
        name: unit.name, // This is the canonical unit type field
        status: unit.status,
      });
    }
  }
  
  return {
    updateTime,
    units,
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
 * 
 * @see OlympusUnitPosition
 * @see BfisLatLng
 */
export function convertLatLngToPosition(latLng: BfisLatLng): { lat: number; lon: number; altMeters: number } {
  return {
    lat: latLng.lat,
    lon: latLng.lng,
    altMeters: latLng.alt,
  };
}

