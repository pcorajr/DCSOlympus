/**
 * Convert Olympus binary format coalition enum (uint8) to OlympusCoalition type.
 *
 * @param coalitionID - Numeric coalition ID from binary format (0=NEUTRAL, 1=RED, 2=BLUE)
 * @returns OlympusCoalition string literal, or "UNKNOWN" if coalitionID is invalid
 *
 * @example
 * ```typescript
 * const coalitionId = dataExtractor.extractUInt8();
 * const coalition = enumToCoalition(coalitionId); // "BLUE" | "RED" | "NEUTRAL" | "UNKNOWN"
 * ```
 */
export function enumToCoalition(coalitionID) {
    switch (coalitionID) {
        case 0:
            return "NEUTRAL";
        case 1:
            return "RED";
        case 2:
            return "BLUE";
        default:
            return "UNKNOWN";
    }
}
/**
 * Convert OlympusCoalition type to Olympus binary format coalition enum (uint8).
 *
 * @param coalition - Coalition string literal from shared schema
 * @returns Numeric coalition ID (0=NEUTRAL, 1=RED, 2=BLUE), or 0 for UNKNOWN/invalid
 *
 * @example
 * ```typescript
 * const coalitionId = coalitionToEnum("BLUE"); // 2
 * ```
 */
export function coalitionToEnum(coalition) {
    switch (coalition) {
        case "NEUTRAL":
            return 0;
        case "RED":
            return 1;
        case "BLUE":
            return 2;
        case "UNKNOWN":
        default:
            return 0; // Default to NEUTRAL for UNKNOWN
    }
}
