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
export function decodeUnits(buffer, logger) {
    const dataExtractor = new DataExtractor(buffer);
    // Extract updateTime (first 8 bytes, uint64)
    const updateTime = Number(dataExtractor.extractUInt64());
    // Debug: Log buffer contents if DEBUG_UNIT_BUFFER env var is set
    if (process.env.DEBUG_UNIT_BUFFER === "true") {
        console.log(`[DEBUG] decodeUnits: buffer size=${buffer.byteLength}, updateTime=${updateTime}`);
        debugBufferContents(buffer);
    }
    const units = [];
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
        // CRITICAL: Capture ALL fields - no filtering, no skipping
        const unit = {
            unitId: String(unitIdNum),
            coalition: "UNKNOWN",
            position: { lat: 0, lon: 0, altMeters: 0 },
            human: false,
            controlled: false,
            alive: false,
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
                        // CAPTURE EVERYTHING - no skipping
                        unit.alive = dataExtractor.extractBool();
                        break;
                    case DataIndexes.alarmState:
                        // CAPTURE EVERYTHING - no skipping
                        unit.alarmState = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.radarState:
                        // CAPTURE EVERYTHING - no skipping
                        unit.radarState = dataExtractor.extractBool();
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
                        // CAPTURE EVERYTHING - no skipping
                        unit.country = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.name:
                        // CRITICAL: name is the canonical unit type field (not unitName)
                        // This matches the working decoder pattern: fields.name is the unit type
                        const name = dataExtractor.extractString();
                        unit.name = name;
                        unit.unitType = name; // Use name as unitType (primary source)
                        break;
                    case DataIndexes.unitName:
                        // CAPTURE EVERYTHING - unitName is a fallback/secondary field
                        const unitName = dataExtractor.extractString();
                        unit.unitName = unitName;
                        // Only use unitName if name wasn't already set
                        if (!unit.unitType) {
                            unit.unitType = unitName;
                        }
                        break;
                    case DataIndexes.callsign:
                        // CAPTURE EVERYTHING - no skipping
                        unit.callsign = dataExtractor.extractString();
                        break;
                    case DataIndexes.groupName:
                        // CAPTURE EVERYTHING - no skipping
                        unit.groupName = dataExtractor.extractString();
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
                    case DataIndexes.task:
                        // CAPTURE EVERYTHING - no skipping
                        unit.task = dataExtractor.extractString();
                        break;
                    case DataIndexes.hasTask:
                        // CAPTURE EVERYTHING - no skipping
                        unit.hasTask = dataExtractor.extractBool();
                        break;
                    case DataIndexes.speed:
                        // CAPTURE EVERYTHING - no skipping
                        unit.speed = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.horizontalVelocity:
                        // CAPTURE EVERYTHING - no skipping
                        unit.horizontalVelocity = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.verticalVelocity:
                        // CAPTURE EVERYTHING - no skipping
                        unit.verticalVelocity = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.heading:
                        // CAPTURE EVERYTHING - no skipping
                        unit.heading = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.track:
                        // CAPTURE EVERYTHING - no skipping
                        unit.track = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.isActiveTanker:
                        // CAPTURE EVERYTHING - no skipping
                        unit.isActiveTanker = dataExtractor.extractBool();
                        break;
                    case DataIndexes.isActiveAWACS:
                        // CAPTURE EVERYTHING - no skipping
                        unit.isActiveAWACS = dataExtractor.extractBool();
                        break;
                    case DataIndexes.onOff:
                        // CAPTURE EVERYTHING - no skipping
                        unit.onOff = dataExtractor.extractBool();
                        break;
                    case DataIndexes.followRoads:
                        // CAPTURE EVERYTHING - no skipping
                        unit.followRoads = dataExtractor.extractBool();
                        break;
                    case DataIndexes.fuel:
                        // CAPTURE EVERYTHING - no skipping
                        unit.fuel = dataExtractor.extractUInt16();
                        break;
                    case DataIndexes.desiredSpeed:
                        // CAPTURE EVERYTHING - no skipping
                        unit.desiredSpeed = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.desiredSpeedType:
                        // CAPTURE EVERYTHING - no skipping
                        unit.desiredSpeedType = dataExtractor.extractBool() ? "CAS" : "GS";
                        break;
                    case DataIndexes.desiredAltitude:
                        // CAPTURE EVERYTHING - no skipping
                        unit.desiredAltitude = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.desiredAltitudeType:
                        // CAPTURE EVERYTHING - no skipping
                        unit.desiredAltitudeType = dataExtractor.extractBool() ? "ASL" : "AGL";
                        break;
                    case DataIndexes.leaderID:
                        // CAPTURE EVERYTHING - no skipping
                        unit.leaderID = dataExtractor.extractUInt32();
                        break;
                    case DataIndexes.formationOffset:
                        // CAPTURE EVERYTHING - no skipping
                        unit.formationOffset = dataExtractor.extractOffset();
                        break;
                    case DataIndexes.targetID:
                        // CAPTURE EVERYTHING - no skipping
                        unit.targetID = dataExtractor.extractUInt32();
                        break;
                    case DataIndexes.targetPosition:
                        // CAPTURE EVERYTHING - no skipping
                        const targetLatLng = dataExtractor.extractLatLng();
                        unit.targetPosition = convertLatLngToPosition(targetLatLng);
                        break;
                    case DataIndexes.ROE:
                        // CAPTURE EVERYTHING - no skipping
                        const roeNum = dataExtractor.extractUInt8();
                        unit.ROE = String(roeNum);
                        break;
                    case DataIndexes.reactionToThreat:
                        // CAPTURE EVERYTHING - no skipping
                        const reactionNum = dataExtractor.extractUInt8();
                        unit.reactionToThreat = String(reactionNum);
                        break;
                    case DataIndexes.emissionsCountermeasures:
                        // CAPTURE EVERYTHING - no skipping
                        const emissionsNum = dataExtractor.extractUInt8();
                        unit.emissionsCountermeasures = String(emissionsNum);
                        break;
                    case DataIndexes.TACAN:
                        // CAPTURE EVERYTHING - no skipping
                        unit.TACAN = dataExtractor.extractTacan();
                        break;
                    case DataIndexes.radio:
                        // CAPTURE EVERYTHING - no skipping
                        unit.radio = dataExtractor.extractRadio();
                        break;
                    case DataIndexes.generalSettings:
                        // CAPTURE EVERYTHING - no skipping
                        unit.generalSettings = dataExtractor.extractGeneralSettings();
                        break;
                    case DataIndexes.ammo:
                        // CAPTURE EVERYTHING - no skipping
                        unit.ammo = dataExtractor.extractAmmo();
                        break;
                    case DataIndexes.contacts:
                        // CAPTURE EVERYTHING - no skipping
                        unit.contacts = dataExtractor.extractContacts();
                        break;
                    case DataIndexes.activePath:
                        // CAPTURE EVERYTHING - no skipping
                        unit.activePath = dataExtractor.extractActivePath();
                        break;
                    case DataIndexes.isLeader:
                        // CAPTURE EVERYTHING - no skipping
                        unit.isLeader = dataExtractor.extractBool();
                        break;
                    case DataIndexes.operateAs:
                        // CAPTURE EVERYTHING - no skipping
                        unit.operateAs = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.shotsScatter:
                        // CAPTURE EVERYTHING - no skipping
                        unit.shotsScatter = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.shotsIntensity:
                        // CAPTURE EVERYTHING - no skipping
                        unit.shotsIntensity = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.health:
                        // CAPTURE EVERYTHING - no skipping
                        unit.health = dataExtractor.extractUInt8();
                        break;
                    case DataIndexes.racetrackLength:
                        // CAPTURE EVERYTHING - no skipping
                        unit.racetrackLength = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.racetrackAnchor:
                        // CAPTURE EVERYTHING - no skipping
                        const racetrackLatLng = dataExtractor.extractLatLng();
                        unit.racetrackAnchor = convertLatLngToPosition(racetrackLatLng);
                        break;
                    case DataIndexes.racetrackBearing:
                        // CAPTURE EVERYTHING - no skipping
                        unit.racetrackBearing = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.timeToNextTasking:
                        // CAPTURE EVERYTHING - no skipping
                        unit.timeToNextTasking = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.barrelHeight:
                        // CAPTURE EVERYTHING - no skipping
                        unit.barrelHeight = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.muzzleVelocity:
                        // CAPTURE EVERYTHING - no skipping
                        unit.muzzleVelocity = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.aimTime:
                        // CAPTURE EVERYTHING - no skipping
                        unit.aimTime = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.shotsToFire:
                        // CAPTURE EVERYTHING - no skipping
                        unit.shotsToFire = dataExtractor.extractUInt32();
                        break;
                    case DataIndexes.shotsBaseInterval:
                        // CAPTURE EVERYTHING - no skipping
                        unit.shotsBaseInterval = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.shotsBaseScatter:
                        // CAPTURE EVERYTHING - no skipping
                        unit.shotsBaseScatter = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.engagementRange:
                        // CAPTURE EVERYTHING - no skipping
                        unit.engagementRange = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.targetingRange:
                        // CAPTURE EVERYTHING - no skipping
                        unit.targetingRange = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.aimMethodRange:
                        // CAPTURE EVERYTHING - no skipping
                        unit.aimMethodRange = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.acquisitionRange:
                        // CAPTURE EVERYTHING - no skipping
                        unit.acquisitionRange = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.airborne:
                        // CAPTURE EVERYTHING - no skipping
                        unit.airborne = dataExtractor.extractBool();
                        break;
                    case DataIndexes.cargoWeight:
                        // CAPTURE EVERYTHING - no skipping
                        unit.cargoWeight = dataExtractor.extractFloat64();
                        break;
                    case DataIndexes.drawingArguments:
                        // CAPTURE EVERYTHING - no skipping
                        unit.drawingArguments = dataExtractor.extractDrawingArguments();
                        break;
                    case DataIndexes.customString:
                        // CAPTURE EVERYTHING - no skipping
                        unit.customString = dataExtractor.extractString();
                        break;
                    case DataIndexes.customInteger:
                        // CAPTURE EVERYTHING - no skipping
                        unit.customInteger = dataExtractor.extractUInt32();
                        break;
                    default:
                        // Unknown datumIndex - skip based on type to avoid corrupting buffer
                        const dataType = DATA_INDEX_TYPES[datumIndex];
                        if (dataType) {
                            // We know the type, skip it correctly
                            skipDataByType(dataExtractor, dataType);
                        }
                        else {
                            // Unknown datumIndex that's not in our mapping - search for next 0xFF marker
                            // This matches the working decoder's error recovery pattern
                            if (logger) {
                                logger.warn("bfis-unit-decode-unknown-datum-index", {
                                    datumIndex,
                                    unitId: unitIdNum,
                                    recovery: "searching-for-end-of-data-marker",
                                });
                            }
                            else {
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
                                }
                                else {
                                    // Give up on this unit - stop decoding (matches working decoder behavior)
                                    if (logger) {
                                        logger.warn("bfis-unit-decode-recovery-failed", {
                                            unitId: unitIdNum,
                                            reason: "unknown-datum-index-no-sync-point",
                                        });
                                    }
                                    else {
                                        console.warn(`Could not recover for unit ${unitIdNum} - stopping decode`);
                                    }
                                    dataExtractor.setSeekPosition(buffer.byteLength); // Exit outer loop
                                    break fieldLoop;
                                }
                            }
                            else {
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
            }
            catch (error) {
                // Error reading field - skip to next 0xFF marker (matches working decoder pattern)
                // CRITICAL: We must continue to next unit even if this one fails
                if (logger) {
                    logger.warn("bfis-unit-decode-field-error", {
                        datumIndex,
                        unitId: unitIdNum,
                        error: error instanceof Error ? error.message : String(error),
                        errorType: error instanceof Error ? error.constructor.name : typeof error,
                    });
                }
                else {
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
                    }
                    else {
                        // Give up on this unit - stop decoding (matches working decoder behavior)
                        if (logger) {
                            logger.warn("bfis-unit-decode-recovery-failed", {
                                unitId: unitIdNum,
                                reason: "field-read-error-no-sync-point",
                            });
                        }
                        else {
                            console.warn(`Could not recover for unit ${unitIdNum} after error - stopping decode`);
                        }
                        dataExtractor.setSeekPosition(buffer.byteLength); // Exit outer loop
                        break fieldLoop;
                    }
                }
                else {
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
            // CRITICAL: Include ALL captured fields - no filtering, no omission
            // This is a non-negotiable requirement for data capture operations
            units.push({
                ...unit,
                unitId: unit.unitId,
                category: unit.category || "Unknown",
                coalition: unit.coalition || "UNKNOWN",
                // Priority: name (canonical) > unitName (fallback) > category (last resort)
                unitType: unit.unitType || unit.category || "Unknown",
                position: unit.position || { lat: 0, lon: 0, altMeters: 0 },
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
export function convertLatLngToPosition(latLng) {
    return {
        lat: latLng.lat,
        lon: latLng.lng,
        altMeters: latLng.alt,
    };
}
