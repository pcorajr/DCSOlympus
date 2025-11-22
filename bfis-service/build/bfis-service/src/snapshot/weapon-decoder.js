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
 * Weapon fields (from frontend/react/src/weapon/weapon.ts):
 * - category: string (e.g., "Missile", "Bomb", "Shell")
 * - alive: boolean
 * - coalition: uint8 (converted to OlympusCoalition)
 * - name: string (weapon type name)
 * - position: LatLng (lat, lon, alt)
 * - speed: float64 (m/s)
 * - heading: float64 (radians)
 *
 * @see DataExtractor
 * @see DataIndexes
 * @see frontend/react/src/weapon/weaponsmanager.ts:58-89
 * @see frontend/react/src/weapon/weapon.ts:65-99
 */
import { DataExtractor } from "./binary-decoder.js";
import { DataIndexes } from "./data-indexes.js";
import { enumToCoalition } from "./coalition-helper.js";
/**
 * Decode binary weapons buffer into structured weapon data.
 *
 * Extracts the leading updateTime and decodes all weapon data from the buffer.
 * Follows the same pattern as the Olympus frontend weapons manager.
 *
 * This function maintains weapon state in a cache (passed as parameter) to handle
 * delta-encoded updates. New weapons require category to be the first field after ID.
 * Existing weapons are updated with any fields present in the buffer.
 *
 * @param buffer - Binary ArrayBuffer from `/olympus/weapons` endpoint
 * @param weaponCache - Map of weaponId to DecodedWeapon for state accumulation
 * @returns Object containing updateTime (milliseconds) and weapons array (all cached weapons)
 *
 * @example
 * ```typescript
 * const weaponCache = new Map<number, DecodedWeapon>();
 * const { updateTime, weapons } = decodeWeapons(buffer, weaponCache);
 * // weapons is DecodedWeapon[] (all weapons from cache)
 * ```
 */
export function decodeWeapons(buffer, weaponCache) {
    if (process.env.DEBUG_WEAPON_DECODER === "true") {
        console.log(`[DEBUG] decodeWeapons called, buffer size: ${buffer.byteLength}`);
    }
    const dataExtractor = new DataExtractor(buffer);
    // Extract updateTime (first 8 bytes, uint64)
    const updateTime = Number(dataExtractor.extractUInt64());
    if (process.env.DEBUG_WEAPON_DECODER === "true") {
        console.log(`[DEBUG] After updateTime extraction, position: ${dataExtractor.getSeekPosition()}, buffer length: ${buffer.byteLength}`);
    }
    // Loop through buffer extracting weapons
    // Pattern matches frontend weaponsmanager.ts:67-84
    // Frontend uses: while (dataExtractor.getSeekPosition() < buffer.byteLength)
    while (dataExtractor.getSeekPosition() < buffer.byteLength) {
        // Extract weapon ID (uint32)
        const weaponIdNum = dataExtractor.extractUInt32();
        // If weapon doesn't exist in cache, check if category comes first (new weapon)
        if (!weaponCache.has(weaponIdNum)) {
            // For new weapons, category must be the first field after ID
            // Frontend pattern: if (!(ID in this.#weapons)) { check for category }
            const datumIndex = dataExtractor.extractUInt8();
            if (datumIndex === DataIndexes.category) {
                const category = dataExtractor.extractString();
                // Create new weapon with category
                const newWeapon = {
                    weaponId: weaponIdNum,
                    category,
                    alive: false,
                    coalition: "UNKNOWN",
                    name: "",
                    position: { lat: 0, lng: 0, alt: 0 },
                    speed: 0,
                    heading: 0,
                    updateTime,
                };
                weaponCache.set(weaponIdNum, newWeapon);
            }
            else {
                // Inconsistent data - category not first for new weapon
                // Frontend returns early, but we'll skip this weapon and continue
                // Skip to next potential weapon ID or end of buffer
                // Try to find next weapon ID or end of buffer
                let foundNext = false;
                const startPos = dataExtractor.getSeekPosition();
                for (let i = 0; i < Math.min(500, buffer.byteLength - startPos - 4); i++) {
                    if (startPos + i + 4 <= buffer.byteLength) {
                        // Check if this could be a weapon ID (reasonable range)
                        const potentialId = new DataView(buffer).getUint32(startPos + i, true);
                        if (potentialId > 0 && potentialId < 100000000) {
                            dataExtractor.setSeekPosition(startPos + i);
                            foundNext = true;
                            break;
                        }
                    }
                }
                if (!foundNext) {
                    // Can't find next weapon, stop decoding
                    break;
                }
                continue; // Skip this weapon, try next
            }
        }
        // Get existing weapon from cache (or newly created one)
        const existingWeapon = weaponCache.get(weaponIdNum);
        if (!existingWeapon) {
            // Should not happen, but safety check
            continue;
        }
        // Update weapon fields (matches frontend setData pattern)
        // Frontend pattern: loops until datumIndex == DataIndexes.endOfData
        let datumIndex = 0;
        while (datumIndex !== DataIndexes.endOfData) {
            datumIndex = dataExtractor.extractUInt8();
            switch (datumIndex) {
                case DataIndexes.endOfData:
                    break; // Exit loop
                case DataIndexes.startOfData:
                    break; // Skip
                case DataIndexes.category:
                    // Category can appear in updates (extract but may not change)
                    dataExtractor.extractString();
                    break;
                case DataIndexes.alive:
                    existingWeapon.alive = dataExtractor.extractBool();
                    break;
                case DataIndexes.coalition:
                    existingWeapon.coalition = enumToCoalition(dataExtractor.extractUInt8());
                    break;
                case DataIndexes.name:
                    existingWeapon.name = dataExtractor.extractString();
                    break;
                case DataIndexes.position:
                    const lat = dataExtractor.extractFloat64();
                    const lng = dataExtractor.extractFloat64();
                    const alt = dataExtractor.extractFloat64();
                    existingWeapon.position = { lat, lng, alt };
                    break;
                case DataIndexes.speed:
                    existingWeapon.speed = dataExtractor.extractFloat64();
                    break;
                case DataIndexes.heading:
                    existingWeapon.heading = dataExtractor.extractFloat64();
                    break;
                default:
                    // Unknown datumIndex - skip by finding next endOfData
                    const startPos = dataExtractor.getSeekPosition();
                    let found = false;
                    for (let i = 0; i < Math.min(100, buffer.byteLength - startPos); i++) {
                        if (new Uint8Array(buffer)[startPos + i] === 0xFF) {
                            dataExtractor.setSeekPosition(startPos + i);
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Can't find endOfData, exit loop
                        datumIndex = DataIndexes.endOfData;
                    }
                    break;
            }
        }
    }
    // Return all weapons from cache (matches frontend pattern)
    const weapons = Array.from(weaponCache.values());
    if (process.env.DEBUG_WEAPON_DECODER === "true") {
        console.log(`[DEBUG] Weapon decoder: ${weapons.length} weapons in cache`);
    }
    return {
        updateTime,
        weapons,
    };
}
