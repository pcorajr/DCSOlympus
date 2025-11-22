/**
 * DataIndex type mapping for proper buffer skipping.
 *
 * This module provides a mapping from DataIndexes to their data types,
 * allowing the decoder to skip unknown fields without corrupting the buffer.
 *
 * Based on frontend/react/src/unit/unit.ts setData() implementation.
 */
import { DataIndexes } from "./data-indexes.js";
/**
 * Mapping from DataIndex to its data type.
 *
 * This allows the decoder to skip unknown fields correctly by reading
 * the appropriate number of bytes based on the data type.
 */
export const DATA_INDEX_TYPES = {
    [DataIndexes.startOfData]: "uint8",
    [DataIndexes.category]: "string",
    [DataIndexes.alive]: "bool",
    [DataIndexes.alarmState]: "uint8",
    [DataIndexes.radarState]: "bool",
    [DataIndexes.human]: "bool",
    [DataIndexes.controlled]: "bool",
    [DataIndexes.coalition]: "uint8",
    [DataIndexes.country]: "uint8",
    [DataIndexes.name]: "string",
    [DataIndexes.unitName]: "string",
    [DataIndexes.callsign]: "string",
    [DataIndexes.unitID]: "uint32",
    [DataIndexes.groupID]: "uint32",
    [DataIndexes.groupName]: "string",
    [DataIndexes.state]: "uint8",
    [DataIndexes.task]: "string",
    [DataIndexes.hasTask]: "bool",
    [DataIndexes.position]: "latlng",
    [DataIndexes.speed]: "float64",
    [DataIndexes.horizontalVelocity]: "float64",
    [DataIndexes.verticalVelocity]: "float64",
    [DataIndexes.heading]: "float64",
    [DataIndexes.track]: "float64",
    [DataIndexes.isActiveTanker]: "bool",
    [DataIndexes.isActiveAWACS]: "bool",
    [DataIndexes.onOff]: "bool",
    [DataIndexes.followRoads]: "bool",
    [DataIndexes.fuel]: "uint16",
    [DataIndexes.desiredSpeed]: "float64",
    [DataIndexes.desiredSpeedType]: "bool",
    [DataIndexes.desiredAltitude]: "float64",
    [DataIndexes.desiredAltitudeType]: "bool",
    [DataIndexes.leaderID]: "uint32",
    [DataIndexes.formationOffset]: "offset",
    [DataIndexes.targetID]: "uint32",
    [DataIndexes.targetPosition]: "latlng",
    [DataIndexes.ROE]: "uint8",
    [DataIndexes.reactionToThreat]: "uint8",
    [DataIndexes.emissionsCountermeasures]: "uint8",
    [DataIndexes.TACAN]: "tacan",
    [DataIndexes.radio]: "radio",
    [DataIndexes.generalSettings]: "generalSettings",
    [DataIndexes.ammo]: "ammo",
    [DataIndexes.contacts]: "contacts",
    [DataIndexes.activePath]: "activePath",
    [DataIndexes.isLeader]: "bool",
    [DataIndexes.operateAs]: "uint8",
    [DataIndexes.shotsScatter]: "uint8",
    [DataIndexes.shotsIntensity]: "uint8",
    [DataIndexes.health]: "uint8",
    [DataIndexes.racetrackLength]: "float64",
    [DataIndexes.racetrackAnchor]: "latlng",
    [DataIndexes.racetrackBearing]: "float64",
    [DataIndexes.timeToNextTasking]: "float64",
    [DataIndexes.barrelHeight]: "float64",
    [DataIndexes.muzzleVelocity]: "float64",
    [DataIndexes.aimTime]: "float64",
    [DataIndexes.shotsToFire]: "uint32",
    [DataIndexes.shotsBaseInterval]: "float64",
    [DataIndexes.shotsBaseScatter]: "float64",
    [DataIndexes.engagementRange]: "float64",
    [DataIndexes.targetingRange]: "float64",
    [DataIndexes.aimMethodRange]: "float64",
    [DataIndexes.acquisitionRange]: "float64",
    [DataIndexes.airborne]: "bool",
    [DataIndexes.cargoWeight]: "float64",
    [DataIndexes.drawingArguments]: "drawingArguments",
    [DataIndexes.customString]: "string",
    [DataIndexes.customInteger]: "uint32",
    [DataIndexes.endOfData]: "uint8",
};
/**
 * Skip data of the given type from the DataExtractor.
 *
 * This allows the decoder to skip unknown fields without corrupting
 * the buffer position for subsequent reads.
 *
 * @param extractor - DataExtractor instance
 * @param type - Type of data to skip
 */
export function skipDataByType(extractor, type) {
    switch (type) {
        case "uint8":
            extractor.extractUInt8();
            break;
        case "uint16":
            extractor.extractUInt16();
            break;
        case "uint32":
            extractor.extractUInt32();
            break;
        case "uint64":
            extractor.extractUInt64();
            break;
        case "float64":
            extractor.extractFloat64();
            break;
        case "bool":
            extractor.extractBool();
            break;
        case "string":
            extractor.extractString();
            break;
        case "latlng":
            extractor.extractLatLng();
            break;
        case "tacan":
            extractor.extractTacan();
            break;
        case "radio":
            extractor.extractRadio();
            break;
        case "generalSettings":
            extractor.extractGeneralSettings();
            break;
        case "ammo":
            extractor.extractAmmo();
            break;
        case "contacts":
            extractor.extractContacts();
            break;
        case "activePath":
            extractor.extractActivePath();
            break;
        case "offset":
            extractor.extractOffset();
            break;
        case "drawingArguments":
            extractor.extractDrawingArguments();
            break;
        default:
            // Unknown type - this shouldn't happen, but if it does, we can't skip safely
            throw new Error(`Cannot skip unknown data type: ${type}`);
    }
}
