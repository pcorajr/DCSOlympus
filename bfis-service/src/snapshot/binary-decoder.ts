/**
 * Binary data decoder for Olympus units and weapons endpoints.
 *
 * Per spec: Olympus returns units and weapons data in binary format for efficiency.
 * This decoder will port the existing DataExtractor implementation from
 * the Olympus client code to decode this binary data into normalized structures.
 *
 * BFIS will implement binary decoding for units/weapons using the same format
 * Olympus already uses (porting the existing DataExtractor implementation from
 * the Olympus client code), instead of requesting new JSON endpoints.
 *
 * Implementation approach:
 * - Port DataExtractor from frontend/server or frontend/react codebase
 * - Decode binary ArrayBuffer responses from GET /olympus/units and GET /olympus/weapons
 * - Return normalized OlympusUnit[] and weapons data structures
 * - Handle incremental updates (fullUpdate=false) and time-based queries
 *
 * The binary format is already defined in Olympus; we need to implement
 * the same decoding logic here to maintain compatibility.
 *
 * TODO: Port DataExtractor from frontend/server or frontend/react codebase.
 * The binary format is already defined in Olympus; we need to implement
 * the same decoding logic here.
 */
