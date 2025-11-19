/**
 * Normalization functions for BFIS context data.
 * 
 * These helpers transform raw Olympus JSON responses into deterministic,
 * typed internal structures used by BFIS decision logic.
 * 
 * Key responsibilities:
 * - Validation: Ensure critical fields (ID) are present
 * - Normalization: Map raw fields to internal Normalized* types
 * - Determinism: Sort output by ID to ensure stable snapshots
 * - Resilience: Handle missing/malformed data gracefully
 * 
 * @module ContextNormalizers
 */

import { v4 as randomUUID } from "uuid";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { OlympusCoalition, OlympusUnitPosition } from "../../../shared-schemas/index.js";
import type {
  NormalizedAirbase,
  NormalizedBullseye,
  NormalizedSpot,
  NormalizedDrawing,
  NormalizedLogEntry,
  WeaponsSummary
} from "./types.js";

/**
 * Helper to safely extract ID string from unknown object.
 */
function safeId(obj: any): string | undefined {
  if (typeof obj?.id === "string") return obj.id;
  if (typeof obj?.id === "number") return String(obj.id);
  return undefined;
}

/**
 * Normalize coalition string to OlympusCoalition type.
 * Handles lowercase/uppercase variations from Olympus.
 */
function normalizeCoalition(coalition: unknown): OlympusCoalition {
  if (typeof coalition !== "string") return "UNKNOWN";
  const normalized = coalition.toUpperCase();
  if (normalized === "BLUE" || normalized === "RED" || normalized === "NEUTRAL") {
    return normalized as OlympusCoalition;
  }
  return "UNKNOWN";
}

/**
 * Sort helper for normalized entities.
 */
function sortById<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/**
 * Normalize airbase data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/airbases
 *   Format: { airbases: { "1": { callsign, coalition, latitude, longitude }, ... } }
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedAirbase
 */
export function normalizeAirbases(raw: unknown, logger?: StructuredLogger): NormalizedAirbase[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { airbases?: unknown };
  if (!container.airbases || typeof container.airbases !== "object") return [];

  const result: NormalizedAirbase[] = [];
  const airbasesObj = container.airbases as Record<string, any>;

  // Handle both array and object formats
  if (Array.isArray(airbasesObj)) {
    // Array format (if Olympus ever changes)
    for (const item of airbasesObj) {
      if (!item || typeof item !== "object") continue;
      
      const id = safeId(item);
      
      if (!id) {
        if (logger) {
          logger.warn("bfis-normalization-missing-id", {
            entity: "airbase",
            rawItem: item as Record<string, unknown>
          });
        }
        continue;
      }

      result.push({
        id,
        name: typeof item.callsign === "string" ? item.callsign : undefined,
        coalition: normalizeCoalition(item.coalition),
        position: item.latitude && item.longitude ? {
          lat: Number(item.latitude),
          lon: Number(item.longitude),
          altMeters: Number(item.alt || 0)
        } : undefined
      });
    }
  } else {
    // Object format (keyed by ID) - current Olympus format
    for (const [key, item] of Object.entries(airbasesObj)) {
      if (!item || typeof item !== "object") continue;
      
      // Use the key as ID if item doesn't have an id field
      const id = safeId(item) || key;
      
      result.push({
        id,
        name: typeof item.callsign === "string" ? item.callsign : undefined,
        coalition: normalizeCoalition(item.coalition),
        position: item.latitude && item.longitude ? {
          lat: Number(item.latitude),
          lon: Number(item.longitude),
          altMeters: Number(item.alt || 0)
        } : undefined
      });
    }
  }

  return result.sort(sortById);
}

/**
 * Normalize bullseye data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/bullseyes
 * @returns Sorted array of NormalizedBullseye
 */
export function normalizeBullseyes(raw: unknown): NormalizedBullseye[] {
  if (!raw || typeof raw !== "object") return [];
  
  // Olympus returns object keyed by coalition ID (1=Red, 2=Blue)
  // We transform this to an array for consistency
  // Format: { "1": { lat, lon }, "2": { lat, lon } }
  
  const result: NormalizedBullseye[] = [];
  const rawObj = raw as Record<string, any>;

  for (const [key, val] of Object.entries(rawObj)) {
    if (key === "time" || key === "sessionHash" || typeof val !== "object") continue;

    // Map numeric keys to coalitions
    let coalition: OlympusCoalition = "UNKNOWN";
    if (key === "1") coalition = "RED";
    if (key === "2") coalition = "BLUE";
    if (key === "0") coalition = "NEUTRAL";

    result.push({
      id: `bullseye-${key}`, // Generate stable ID from coalition key
      coalition,
      position: {
        lat: Number(val.latitude || val.lat),
        lon: Number(val.longitude || val.lon),
        altMeters: 0 // Bullseyes are ground points
      }
    });
  }

  return result.sort(sortById);
}

/**
 * Normalize spot data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/spots
 *   Format: { spots: { "id": { type, targetPosition: { lat, lng }, code, sourceUnitID, active }, ... } }
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedSpot
 */
export function normalizeSpots(raw: unknown, logger?: StructuredLogger): NormalizedSpot[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { spots?: unknown };
  if (!container.spots || typeof container.spots !== "object") return [];

  const result: NormalizedSpot[] = [];
  const spotsObj = container.spots as Record<string, any>;

  // Handle both array and object formats
  if (Array.isArray(spotsObj)) {
    // Array format (if Olympus ever changes)
    for (const item of spotsObj) {
      if (!item || typeof item !== "object") continue;
      
      const rawItem = item as any;
      const id = safeId(rawItem) || rawItem.code;

      if (!id) {
        if (logger) {
          logger.warn("bfis-normalization-missing-id", {
            entity: "spot",
            rawItem: item as Record<string, unknown>
          });
        }
        continue;
      }

      // Extract position from targetPosition or direct lat/lon
      const position = rawItem.targetPosition 
        ? {
            lat: Number(rawItem.targetPosition.lat || rawItem.targetPosition.latitude),
            lon: Number(rawItem.targetPosition.lng || rawItem.targetPosition.lon || rawItem.targetPosition.longitude),
            altMeters: Number(rawItem.targetPosition.alt || rawItem.targetPosition.altMeters || 0)
          }
        : (rawItem.lat && rawItem.lon ? {
            lat: Number(rawItem.lat),
            lon: Number(rawItem.lon),
            altMeters: Number(rawItem.alt || 0)
          } : undefined);

      result.push({
        id: String(id),
        type: typeof rawItem.type === "string" ? rawItem.type : "laser",
        position
      });
    }
  } else {
    // Object format (keyed by ID) - current Olympus format
    for (const [key, item] of Object.entries(spotsObj)) {
      if (!item || typeof item !== "object") continue;
      
      const rawItem = item as any;
      
      // Use the key as ID (most stable), or try to find id/code in the data
      // Key is the spot ID from Olympus, which is more stable than code
      const id = safeId(rawItem) || key || rawItem.code;

      if (!id) {
        if (logger) {
          logger.warn("bfis-normalization-missing-id", {
            entity: "spot",
            rawItem: item as Record<string, unknown>
          });
        }
        continue;
      }

      // Extract position from targetPosition (Olympus format)
      // Format: targetPosition: { lat, lng } or direct lat/lon
      const position = rawItem.targetPosition 
        ? {
            lat: Number(rawItem.targetPosition.lat || rawItem.targetPosition.latitude),
            lon: Number(rawItem.targetPosition.lng || rawItem.targetPosition.lon || rawItem.targetPosition.longitude),
            altMeters: Number(rawItem.targetPosition.alt || rawItem.targetPosition.altMeters || 0)
          }
        : (rawItem.lat && rawItem.lon ? {
            lat: Number(rawItem.lat),
            lon: Number(rawItem.lon),
            altMeters: Number(rawItem.alt || 0)
          } : undefined);

      result.push({
        id: String(id),
        type: typeof rawItem.type === "string" ? rawItem.type : "laser",
        position
      });
    }
  }

  return result.sort(sortById);
}

/**
 * Normalize drawing data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/drawings
 *   Format: { drawings: { layerName: { coalition: { id: {...}, ... } } } }
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedDrawing
 * 
 * @defect DRAWINGS-001: Drawings not being captured from Olympus API
 *   - Status: OPEN
 *   - Date: 2025-11-19
 *   - Description: The /olympus/drawings endpoint consistently returns empty objects
 *     for all drawing layers (navpoints.blue, navpoints.neutral, navpoints.red).
 *     The normalizer function is working correctly and will process drawings when
 *     they appear in the API response. Root cause appears to be MIST (Mission
 *     Scripting Tools) not detecting drawings in the DCS mission, or drawings
 *     not being created/saved in a format MIST recognizes.
 *   - Verification: All test runs show drawingCount: 0. API returns 200 OK but
 *     with empty objects. Normalizer tested and confirmed working with test data.
 *   - Related: Olympus Lua code in scripts/lua/backend/OlympusCommand.lua
 *     function Olympus.initializeDrawings() depends on mist.DBs.drawingByName
 */
export function normalizeDrawings(raw: unknown, logger?: StructuredLogger): NormalizedDrawing[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { drawings?: unknown };
  if (!container.drawings || typeof container.drawings !== "object") return [];

  const result: NormalizedDrawing[] = [];
  const drawingsObj = container.drawings as Record<string, any>;

  // Traverse nested structure: drawings -> layers -> (coalitions/customLayers) -> (optional customLayer) -> entries
  // Olympus structure can be:
  // - drawings[layerName][drawingName] = drawingData (direct)
  // - drawings[layerName][coalition][drawingName] = drawingData (with coalition)
  // - drawings[layerName][coalition][customLayer][drawingName] = drawingData (navpoints with customLayer)
  function extractDrawingsFromValue(value: any, path: string = ""): void {
    if (!value || typeof value !== "object") return;
    
    const entries = Object.entries(value);
    if (entries.length === 0) return;
    
    // Check if entries are drawings (have geometry fields) or are intermediate levels
    for (const [key, item] of entries) {
      if (!item || typeof item !== "object") continue;
      
      // Check if this is a drawing (has drawing fields)
      const isDrawing = 'lat' in item || 'lng' in item || 'points' in item || 
                        'text' in item || 'name' in item || 'mapX' in item || 'mapY' in item ||
                        'layerName' in item || 'callsignStr' in item || 'x' in item || 'y' in item;
      
      if (isDrawing) {
        // This is a drawing
        const rawItem = item as any;
        const id = safeId(rawItem) || rawItem.name || rawItem.callsignStr || key;
        
        if (!id) {
          if (logger) {
            logger.warn("bfis-normalization-missing-id", {
              entity: "drawing",
              rawItem: item as Record<string, unknown>
            });
          }
          continue;
        }
        
        const { lat, lon, lng, points, radius, text, name, mapX, mapY, x, y, callsignStr } = rawItem;
        const geometry = { lat, lon, lng, points, radius, mapX, mapY, x, y };
        
        result.push({
          id: String(id),
          label: typeof text === "string" ? text : 
                (typeof name === "string" ? name : 
                 (typeof callsignStr === "string" ? callsignStr : undefined)),
          geometry
        });
      } else {
        // This is an intermediate level (coalition, customLayer, etc.) - recurse
        extractDrawingsFromValue(item, path ? `${path}.${key}` : key);
      }
    }
  }
  
  for (const [layerName, layerData] of Object.entries(drawingsObj)) {
    if (!layerData || typeof layerData !== "object") continue;
    extractDrawingsFromValue(layerData, layerName);
  }

  return result.sort(sortById);
}

/**
 * Normalize log entries from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/logs
 *   Format: { logs: { timestamp: "message", ... } } (object keyed by timestamp)
 *   or { logs: [...] } (array format, if Olympus changes)
 * @returns Sorted array of NormalizedLogEntry
 */
export function normalizeLogs(raw: unknown): NormalizedLogEntry[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { logs?: unknown };
  if (!container.logs || typeof container.logs !== "object") return [];

  const result: NormalizedLogEntry[] = [];
  const logsObj = container.logs as Record<string, any>;

  // Handle both array and object formats
  if (Array.isArray(logsObj)) {
    // Array format (if Olympus ever changes)
    for (const item of logsObj) {
      if (!item || typeof item !== "object") continue;
      
      const rawItem = item as any;
      const id = safeId(rawItem) || randomUUID();

      result.push({
        id: String(id),
        timestamp: Number(rawItem.time || Date.now()),
        category: typeof rawItem.type === "string" ? rawItem.type : "info",
        message: typeof rawItem.message === "string" ? rawItem.message : JSON.stringify(rawItem),
        fields: rawItem.data
      });
    }
  } else {
    // Object format (keyed by timestamp) - current Olympus format
    // Format: { "timestamp": "message", ... }
    for (const [timestampStr, message] of Object.entries(logsObj)) {
      const timestamp = Number(timestampStr);
      if (isNaN(timestamp)) continue;
      
      const id = `log-${timestampStr}`;
      const messageStr = typeof message === "string" ? message : JSON.stringify(message);

      result.push({
        id,
        timestamp,
        category: "info", // Default category, Olympus doesn't provide type in object format
        message: messageStr,
        fields: undefined
      });
    }
  }

  return result.sort(sortById);
}

/**
 * Build weapons summary from decoded binary data.
 * 
 * @param decodedWeapons - Result from weapon-decoder.decodeWeapons()
 * @returns WeaponsSummary
 */
export function buildWeaponsSummary(decodedWeapons: unknown): WeaponsSummary {
  // If input is null/undefined, return zeroed summary
  if (!decodedWeapons || !Array.isArray(decodedWeapons)) {
    return { lastUpdateTime: 0, activeCount: 0 };
  }

  // Assuming decodedWeapons is an array of weapon objects with updateTime
  const weapons = decodedWeapons as Array<{ updateTime?: number }>;
  
  let maxTime = 0;
  for (const w of weapons) {
    if (typeof w.updateTime === "number" && w.updateTime > maxTime) {
      maxTime = w.updateTime;
    }
  }

  return {
    lastUpdateTime: maxTime,
    activeCount: weapons.length
  };
}

