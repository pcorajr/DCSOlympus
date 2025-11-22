/**
 * DataIndexes enum for binary data decoding.
 *
 * This enum defines the indexes used in Olympus's binary format to indicate
 * the type of data being extracted. The binary format uses a dynamic encoding
 * where each data field is preceded by its DataIndex value, allowing for
 * incremental/differential updates.
 *
 * This mirrors the Olympus frontend DataIndexes enum from
 * `frontend/react/src/constants/constants.ts:485` to ensure compatibility
 * with the binary format.
 *
 * Usage:
 * - Extract datumIndex: `extractUInt8()`
 * - Switch on datumIndex to determine which field follows
 * - Extract the field value using the appropriate DataExtractor method
 * - Continue until `datumIndex === DataIndexes.endOfData` (255)
 *
 * @see DataExtractor
 * @see unit-decoder.ts
 * @see weapon-decoder.ts
 */
export var DataIndexes;
(function (DataIndexes) {
    DataIndexes[DataIndexes["startOfData"] = 0] = "startOfData";
    DataIndexes[DataIndexes["category"] = 1] = "category";
    DataIndexes[DataIndexes["alive"] = 2] = "alive";
    DataIndexes[DataIndexes["alarmState"] = 3] = "alarmState";
    DataIndexes[DataIndexes["radarState"] = 4] = "radarState";
    DataIndexes[DataIndexes["human"] = 5] = "human";
    DataIndexes[DataIndexes["controlled"] = 6] = "controlled";
    DataIndexes[DataIndexes["coalition"] = 7] = "coalition";
    DataIndexes[DataIndexes["country"] = 8] = "country";
    DataIndexes[DataIndexes["name"] = 9] = "name";
    DataIndexes[DataIndexes["unitName"] = 10] = "unitName";
    DataIndexes[DataIndexes["callsign"] = 11] = "callsign";
    DataIndexes[DataIndexes["unitID"] = 12] = "unitID";
    DataIndexes[DataIndexes["groupID"] = 13] = "groupID";
    DataIndexes[DataIndexes["groupName"] = 14] = "groupName";
    DataIndexes[DataIndexes["state"] = 15] = "state";
    DataIndexes[DataIndexes["task"] = 16] = "task";
    DataIndexes[DataIndexes["hasTask"] = 17] = "hasTask";
    DataIndexes[DataIndexes["position"] = 18] = "position";
    DataIndexes[DataIndexes["speed"] = 19] = "speed";
    DataIndexes[DataIndexes["horizontalVelocity"] = 20] = "horizontalVelocity";
    DataIndexes[DataIndexes["verticalVelocity"] = 21] = "verticalVelocity";
    DataIndexes[DataIndexes["heading"] = 22] = "heading";
    DataIndexes[DataIndexes["track"] = 23] = "track";
    DataIndexes[DataIndexes["isActiveTanker"] = 24] = "isActiveTanker";
    DataIndexes[DataIndexes["isActiveAWACS"] = 25] = "isActiveAWACS";
    DataIndexes[DataIndexes["onOff"] = 26] = "onOff";
    DataIndexes[DataIndexes["followRoads"] = 27] = "followRoads";
    DataIndexes[DataIndexes["fuel"] = 28] = "fuel";
    DataIndexes[DataIndexes["desiredSpeed"] = 29] = "desiredSpeed";
    DataIndexes[DataIndexes["desiredSpeedType"] = 30] = "desiredSpeedType";
    DataIndexes[DataIndexes["desiredAltitude"] = 31] = "desiredAltitude";
    DataIndexes[DataIndexes["desiredAltitudeType"] = 32] = "desiredAltitudeType";
    DataIndexes[DataIndexes["leaderID"] = 33] = "leaderID";
    DataIndexes[DataIndexes["formationOffset"] = 34] = "formationOffset";
    DataIndexes[DataIndexes["targetID"] = 35] = "targetID";
    DataIndexes[DataIndexes["targetPosition"] = 36] = "targetPosition";
    DataIndexes[DataIndexes["ROE"] = 37] = "ROE";
    DataIndexes[DataIndexes["reactionToThreat"] = 38] = "reactionToThreat";
    DataIndexes[DataIndexes["emissionsCountermeasures"] = 39] = "emissionsCountermeasures";
    DataIndexes[DataIndexes["TACAN"] = 40] = "TACAN";
    DataIndexes[DataIndexes["radio"] = 41] = "radio";
    DataIndexes[DataIndexes["generalSettings"] = 42] = "generalSettings";
    DataIndexes[DataIndexes["ammo"] = 43] = "ammo";
    DataIndexes[DataIndexes["contacts"] = 44] = "contacts";
    DataIndexes[DataIndexes["activePath"] = 45] = "activePath";
    DataIndexes[DataIndexes["isLeader"] = 46] = "isLeader";
    DataIndexes[DataIndexes["operateAs"] = 47] = "operateAs";
    DataIndexes[DataIndexes["shotsScatter"] = 48] = "shotsScatter";
    DataIndexes[DataIndexes["shotsIntensity"] = 49] = "shotsIntensity";
    DataIndexes[DataIndexes["health"] = 50] = "health";
    DataIndexes[DataIndexes["racetrackLength"] = 51] = "racetrackLength";
    DataIndexes[DataIndexes["racetrackAnchor"] = 52] = "racetrackAnchor";
    DataIndexes[DataIndexes["racetrackBearing"] = 53] = "racetrackBearing";
    DataIndexes[DataIndexes["timeToNextTasking"] = 54] = "timeToNextTasking";
    DataIndexes[DataIndexes["barrelHeight"] = 55] = "barrelHeight";
    DataIndexes[DataIndexes["muzzleVelocity"] = 56] = "muzzleVelocity";
    DataIndexes[DataIndexes["aimTime"] = 57] = "aimTime";
    DataIndexes[DataIndexes["shotsToFire"] = 58] = "shotsToFire";
    DataIndexes[DataIndexes["shotsBaseInterval"] = 59] = "shotsBaseInterval";
    DataIndexes[DataIndexes["shotsBaseScatter"] = 60] = "shotsBaseScatter";
    DataIndexes[DataIndexes["engagementRange"] = 61] = "engagementRange";
    DataIndexes[DataIndexes["targetingRange"] = 62] = "targetingRange";
    DataIndexes[DataIndexes["aimMethodRange"] = 63] = "aimMethodRange";
    DataIndexes[DataIndexes["acquisitionRange"] = 64] = "acquisitionRange";
    DataIndexes[DataIndexes["airborne"] = 65] = "airborne";
    DataIndexes[DataIndexes["cargoWeight"] = 66] = "cargoWeight";
    DataIndexes[DataIndexes["drawingArguments"] = 67] = "drawingArguments";
    DataIndexes[DataIndexes["customString"] = 68] = "customString";
    DataIndexes[DataIndexes["customInteger"] = 69] = "customInteger";
    DataIndexes[DataIndexes["endOfData"] = 255] = "endOfData";
})(DataIndexes || (DataIndexes = {}));
