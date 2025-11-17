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
export enum DataIndexes {
  startOfData = 0,
  category,
  alive,
  alarmState,
  radarState,
  human,
  controlled,
  coalition,
  country,
  name,
  unitName,
  callsign,
  unitID,
  groupID,
  groupName,
  state,
  task,
  hasTask,
  position,
  speed,
  horizontalVelocity,
  verticalVelocity,
  heading,
  track,
  isActiveTanker,
  isActiveAWACS,
  onOff,
  followRoads,
  fuel,
  desiredSpeed,
  desiredSpeedType,
  desiredAltitude,
  desiredAltitudeType,
  leaderID,
  formationOffset,
  targetID,
  targetPosition,
  ROE,
  reactionToThreat,
  emissionsCountermeasures,
  TACAN,
  radio,
  generalSettings,
  ammo,
  contacts,
  activePath,
  isLeader,
  operateAs,
  shotsScatter,
  shotsIntensity,
  health,
  racetrackLength,
  racetrackAnchor,
  racetrackBearing,
  timeToNextTasking,
  barrelHeight,
  muzzleVelocity,
  aimTime,
  shotsToFire,
  shotsBaseInterval,
  shotsBaseScatter,
  engagementRange,
  targetingRange,
  aimMethodRange,
  acquisitionRange,
  airborne,
  cargoWeight,
  drawingArguments,
  customString,
  customInteger,
  endOfData = 255,
}

