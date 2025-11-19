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
 * Sort helper for normalized entities.
 */
function sortById<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/**
 * Normalize airbase data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/airbases (expected { airbases: [...] })
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedAirbase
 */
export function normalizeAirbases(raw: unknown, logger?: StructuredLogger): NormalizedAirbase[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { airbases?: unknown[] };
  if (!Array.isArray(container.airbases)) return [];

  const result: NormalizedAirbase[] = [];

  for (const item of container.airbases) {
    if (!item || typeof item !== "object") continue;
    
    const id = safeId(item);
    
    // Critical field check
    if (!id) {
      if (logger) {
        logger.warn("bfis-normalization-missing-id", {
          entity: "airbase",
          rawItem: item as Record<string, unknown>
        });
      }
      continue;
    }

    const rawItem = item as any;
    
    result.push({
      id,
      name: typeof rawItem.callsign === "string" ? rawItem.callsign : undefined,
      coalition: rawItem.coalition as OlympusCoalition,
      position: rawItem.lat && rawItem.lon ? {
        lat: Number(rawItem.lat),
        lon: Number(rawItem.lon),
        altMeters: Number(rawItem.alt || 0)
      } : undefined
    });
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
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedSpot
 */
export function normalizeSpots(raw: unknown, logger?: StructuredLogger): NormalizedSpot[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { spots?: unknown[] };
  if (!Array.isArray(container.spots)) return [];

  const result: NormalizedSpot[] = [];

  for (const item of container.spots) {
    if (!item || typeof item !== "object") continue;
    
    // Spots often don't have stable IDs from DCS, usually just index
    // We try to find an ID, or skip if totally unidentifiable
    const rawItem = item as any;
    const id = safeId(rawItem) || rawItem.code; // Fallback to laser code if present

    if (!id) {
      if (logger) {
        logger.warn("bfis-normalization-missing-id", {
          entity: "spot",
          rawItem: item as Record<string, unknown>
        });
      }
      continue;
    }

    result.push({
      id: String(id),
      type: "laser", // Default for now, could infer from fields
      position: rawItem.lat && rawItem.lon ? {
        lat: Number(rawItem.lat),
        lon: Number(rawItem.lon),
        altMeters: Number(rawItem.alt || 0)
      } : undefined
    });
  }

  return result.sort(sortById);
}

/**
 * Normalize drawing data from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/drawings
 * @param logger - Optional logger for warnings
 * @returns Sorted array of NormalizedDrawing
 */
export function normalizeDrawings(raw: unknown, logger?: StructuredLogger): NormalizedDrawing[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { drawings?: unknown[] };
  if (!Array.isArray(container.drawings)) return [];

  const result: NormalizedDrawing[] = [];

  for (const item of container.drawings) {
    if (!item || typeof item !== "object") continue;
    
    const rawItem = item as any;
    // Drawings use 'name' as ID often, or 'id'
    const id = safeId(rawItem) || rawItem.name;

    if (!id) {
      if (logger) {
        logger.warn("bfis-normalization-missing-id", {
          entity: "drawing",
          rawItem: item as Record<string, unknown>
        });
      }
      continue;
    }

    // Extract geometry safely (could be point, line, poly)
    // We preserve raw structure for geometry as it varies
    const { lat, lon, points, radius } = rawItem;
    const geometry = { lat, lon, points, radius };

    result.push({
      id: String(id),
      label: typeof rawItem.text === "string" ? rawItem.text : rawItem.name,
      geometry
    });
  }

  return result.sort(sortById);
}

/**
 * Normalize log entries from Olympus response.
 * 
 * @param raw - Raw JSON response from /olympus/logs
 * @returns Sorted array of NormalizedLogEntry
 */
export function normalizeLogs(raw: unknown): NormalizedLogEntry[] {
  if (!raw || typeof raw !== "object") return [];
  
  const container = raw as { logs?: unknown[] };
  if (!Array.isArray(container.logs)) return [];

  const result: NormalizedLogEntry[] = [];

  for (const item of container.logs) {
    if (!item || typeof item !== "object") continue;
    
    const rawItem = item as any;
    
    // Logs often lack IDs. We generate one if missing to ensure stability.
    // Using randomUUID here is acceptable as logs are transient in context,
    // but deterministic hash would be better if we had stable input.
    // For MVP, we accept that re-fetching same logs might generate new IDs
    // (though logs are usually fetched incrementally).
    const id = safeId(rawItem) || randomUUID();

    result.push({
      id: String(id),
      timestamp: Number(rawItem.time || Date.now()),
      category: typeof rawItem.type === "string" ? rawItem.type : "info",
      message: typeof rawItem.message === "string" ? rawItem.message : JSON.stringify(rawItem),
      fields: rawItem.data // Preserve raw data fields
    });
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

