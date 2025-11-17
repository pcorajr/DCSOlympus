/**
 * Debug utility to inspect binary buffer contents.
 * 
 * This module helps diagnose what data is actually present in the binary buffer
 * by logging all DataIndexes encountered during decoding.
 */

import { DataExtractor } from "./binary-decoder.js";
import { DataIndexes } from "./data-indexes.js";

/**
 * Debug: Log all DataIndexes in a buffer to see what data is present.
 * 
 * @param buffer - Binary ArrayBuffer to inspect
 * @param unitId - Optional unit ID for logging context
 */
export function debugBufferContents(buffer: ArrayBuffer, unitId?: number): void {
  const dataExtractor = new DataExtractor(buffer);
  
  // Extract updateTime
  const updateTime = Number(dataExtractor.extractUInt64());
  console.log(`[DEBUG] Buffer updateTime: ${updateTime}, size: ${buffer.byteLength} bytes`);
  
  if (unitId !== undefined) {
    console.log(`[DEBUG] Inspecting buffer for unit ${unitId}:`);
  }
  
  let unitCount = 0;
  while (dataExtractor.getSeekPosition() + 4 <= buffer.byteLength) {
    const pos = dataExtractor.getSeekPosition();
    const unitIdNum = dataExtractor.extractUInt32();
    unitCount++;
    
    console.log(`[DEBUG] Unit ${unitCount} (ID: ${unitIdNum}) at position ${pos}:`);
    
    const indexes: number[] = [];
    while (dataExtractor.getSeekPosition() < buffer.byteLength) {
      const datumIndex = dataExtractor.extractUInt8();
      
      if (datumIndex === DataIndexes.endOfData) {
        indexes.push(datumIndex);
        break;
      }
      
      indexes.push(datumIndex);
      
      // Skip the data based on type (simplified - just to advance position)
      // This is for debugging only, not for actual extraction
      try {
        switch (datumIndex) {
          case DataIndexes.category:
          case DataIndexes.name:
          case DataIndexes.unitName:
          case DataIndexes.callsign:
          case DataIndexes.groupName:
          case DataIndexes.task:
          case DataIndexes.desiredSpeedType:
          case DataIndexes.desiredAltitudeType:
          case DataIndexes.operateAs:
          case DataIndexes.customString:
            dataExtractor.extractString();
            break;
          case DataIndexes.coalition:
          case DataIndexes.country:
          case DataIndexes.state:
          case DataIndexes.alarmState:
          case DataIndexes.ROE:
          case DataIndexes.reactionToThreat:
          case DataIndexes.emissionsCountermeasures:
          case DataIndexes.shotsScatter:
          case DataIndexes.shotsIntensity:
          case DataIndexes.health:
            dataExtractor.extractUInt8();
            break;
          case DataIndexes.unitID:
          case DataIndexes.groupID:
          case DataIndexes.leaderID:
          case DataIndexes.targetID:
          case DataIndexes.shotsToFire:
          case DataIndexes.customInteger:
            dataExtractor.extractUInt32();
            break;
          case DataIndexes.position:
          case DataIndexes.targetPosition:
          case DataIndexes.racetrackAnchor:
            dataExtractor.extractLatLng();
            break;
          case DataIndexes.alive:
          case DataIndexes.radarState:
          case DataIndexes.human:
          case DataIndexes.controlled:
          case DataIndexes.hasTask:
          case DataIndexes.isActiveTanker:
          case DataIndexes.isActiveAWACS:
          case DataIndexes.onOff:
          case DataIndexes.followRoads:
          case DataIndexes.isLeader:
          case DataIndexes.airborne:
            dataExtractor.extractBool();
            break;
          case DataIndexes.speed:
          case DataIndexes.horizontalVelocity:
          case DataIndexes.verticalVelocity:
          case DataIndexes.heading:
          case DataIndexes.track:
          case DataIndexes.fuel:
          case DataIndexes.desiredSpeed:
          case DataIndexes.desiredAltitude:
          case DataIndexes.racetrackLength:
          case DataIndexes.racetrackBearing:
          case DataIndexes.timeToNextTasking:
          case DataIndexes.barrelHeight:
          case DataIndexes.muzzleVelocity:
          case DataIndexes.aimTime:
          case DataIndexes.shotsBaseInterval:
          case DataIndexes.shotsBaseScatter:
          case DataIndexes.engagementRange:
          case DataIndexes.targetingRange:
          case DataIndexes.aimMethodRange:
          case DataIndexes.acquisitionRange:
          case DataIndexes.cargoWeight:
            dataExtractor.extractFloat64();
            break;
          case DataIndexes.formationOffset:
            dataExtractor.extractOffset();
            break;
          case DataIndexes.TACAN:
            dataExtractor.extractTacan();
            break;
          case DataIndexes.radio:
            dataExtractor.extractRadio();
            break;
          case DataIndexes.generalSettings:
            dataExtractor.extractGeneralSettings();
            break;
          case DataIndexes.ammo:
            dataExtractor.extractAmmo();
            break;
          case DataIndexes.contacts:
            dataExtractor.extractContacts();
            break;
          case DataIndexes.activePath:
            dataExtractor.extractActivePath();
            break;
          case DataIndexes.drawingArguments:
            dataExtractor.extractDrawingArguments();
            break;
          default:
            console.warn(`[DEBUG] Unknown datumIndex ${datumIndex} at position ${dataExtractor.getSeekPosition()}, buffer size: ${buffer.byteLength}`);
            // Try to continue - might be a new DataIndex we don't know about
            // For debugging, just break to see what we have
            break;
        }
      } catch (err) {
        console.error(`[DEBUG] Error skipping datumIndex ${datumIndex}:`, err);
        break;
      }
    }
    
    console.log(`[DEBUG]   DataIndexes found: [${indexes.join(", ")}]`);
    console.log(`[DEBUG]   End position: ${dataExtractor.getSeekPosition()}`);
    
    if (dataExtractor.getSeekPosition() >= buffer.byteLength) {
      break;
    }
  }
  
  console.log(`[DEBUG] Total units in buffer: ${unitCount}`);
}

