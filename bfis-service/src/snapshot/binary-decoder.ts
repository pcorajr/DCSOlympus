/**
 * Binary data decoder for Olympus units and weapons endpoints.
 *
 * Per spec: Olympus returns units and weapons data in binary format for efficiency.
 * This module ports the existing DataExtractor implementation from the Olympus
 * client code to decode this binary data into normalized structures.
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
 */

/**
 * DataExtractor - low-level binary reader.
 *
 * This is a direct TypeScript port of the Olympus frontend DataExtractor
 * (frontend/react/src/server/dataextractor.ts) with no semantic changes.
 * It provides primitive extraction methods (numbers, strings, structs) that
 * higher-level decoders (units, weapons) will use.
 *
 * The extractor maintains a seek position that advances as data is read.
 * All numeric values are little-endian to match the Olympus binary format.
 */

import type {
  BfisAmmo,
  BfisContact,
  BfisDrawingArgument,
  BfisGeneralSettings,
  BfisLatLng,
  BfisOffset,
  BfisRadio,
  BfisTacan,
} from "../types/internal.js";

/**
 * DataExtractor provides low-level binary reading primitives for Olympus data.
 *
 * This class is a direct port of the frontend DataExtractor with identical behavior.
 * It reads from an ArrayBuffer using a DataView, maintaining a seek position that
 * advances as data is extracted. All numeric types are little-endian.
 */
export class DataExtractor {
  /** Current byte offset in the buffer (seek position) */
  #seekPosition = 0;
  /** DataView for reading typed values from the buffer */
  #dataview: DataView;
  /** UTF-8 text decoder for string extraction */
  #decoder: TextDecoder;
  /** Original ArrayBuffer containing the binary data */
  #buffer: ArrayBuffer;

  /**
   * Create a new DataExtractor for the provided binary buffer.
   *
   * The extractor starts at position 0 and can read through the entire buffer.
   * The buffer is not modified; extraction is read-only.
   *
   * @param buffer - Raw ArrayBuffer received from Olympus units/weapons endpoints
   */
  constructor(buffer: ArrayBuffer) {
    this.#buffer = buffer;
    this.#dataview = new DataView(this.#buffer);
    this.#decoder = new TextDecoder("utf-8");
  }

  /**
   * Set the current seek position in the underlying buffer.
   *
   * Allows jumping to specific offsets in the buffer (useful for skipping headers
   * or reading data structures at known offsets).
   *
   * @param seekPosition - New seek position (byte offset from start of buffer)
   */
  setSeekPosition(seekPosition: number) {
    this.#seekPosition = seekPosition;
  }

  /**
   * Get the current seek position (byte offset from start of buffer).
   *
   * Useful for debugging or calculating remaining buffer size.
   *
   * @returns Current byte offset
   */
  getSeekPosition() {
    return this.#seekPosition;
  }

  /**
   * Extract a boolean value (encoded as uint8, > 0 is true).
   *
   * Olympus encodes booleans as single bytes where any non-zero value is true.
   * This matches the frontend DataExtractor behavior exactly.
   *
   * @returns Boolean value
   */
  extractBool() {
    const value = this.#dataview.getUint8(this.#seekPosition);
    this.#seekPosition += 1;
    return value > 0;
  }

  /**
   * Extract an unsigned 8-bit integer.
   *
   * @returns 8-bit unsigned integer (0-255)
   */
  extractUInt8() {
    const value = this.#dataview.getUint8(this.#seekPosition);
    this.#seekPosition += 1;
    return value;
  }

  /**
   * Extract an unsigned 16-bit integer (little endian).
   *
   * Little-endian byte order matches the Olympus binary format.
   *
   * @returns 16-bit unsigned integer
   */
  extractUInt16() {
    const value = this.#dataview.getUint16(this.#seekPosition, true);
    this.#seekPosition += 2;
    return value;
  }

  /**
   * Extract an unsigned 32-bit integer (little endian).
   *
   * Used for IDs, counts, and other 32-bit values in the Olympus format.
   *
   * @returns 32-bit unsigned integer
   */
  extractUInt32() {
    const value = this.#dataview.getUint32(this.#seekPosition, true);
    this.#seekPosition += 4;
    return value;
  }

  /**
   * Extract an unsigned 64-bit integer (little endian).
   *
   * Returns a BigInt to handle the full 64-bit range.
   *
   * @returns 64-bit unsigned integer as BigInt
   */
  extractUInt64() {
    const value = this.#dataview.getBigUint64(this.#seekPosition, true);
    this.#seekPosition += 8;
    return value;
  }

  /**
   * Extract a 64-bit floating-point number (little endian).
   *
   * Used for coordinates (lat/lng), altitudes, and other precise numeric values.
   *
   * @returns 64-bit floating-point number
   */
  extractFloat64() {
    const value = this.#dataview.getFloat64(this.#seekPosition, true);
    this.#seekPosition += 8;
    return value;
  }

  /**
   * Extract a Lat/Lng/Alt triple followed by a threshold, matching the frontend
   * DataExtractor's extractLatLng implementation.
   *
   * The threshold is included in the binary format but may not always be needed
   * by BFIS. Consumers can ignore it if they only need position data.
   *
   * @returns BfisLatLng object with lat, lng, alt, and optional threshold
   */
  extractLatLng(): BfisLatLng {
    const lat = this.extractFloat64();
    const lng = this.extractFloat64();
    const alt = this.extractFloat64();
    const threshold = this.extractFloat64();
    return { lat, lng, alt, threshold };
  }

  /**
   * Extract a single bit from a bitmask.
   *
   * Used for reading flags and boolean fields packed into bitfields.
   *
   * @param bitmask - The bitmask value
   * @param position - Bit position to extract (0-based, right to left)
   * @returns True if the bit is set, false otherwise
   */
  extractFromBitmask(bitmask: number, position: number) {
    return ((bitmask >> position) & 1) > 0;
  }

  /**
   * Extract a UTF-8 string.
   *
   * If `length` is omitted, a 16-bit length prefix is read first.
   * Trailing null bytes are stripped, and the result is trimmed of whitespace.
   *
   * This matches the frontend DataExtractor's string extraction behavior exactly.
   *
   * @param length - Optional explicit string length (if omitted, reads 16-bit length prefix)
   * @returns Decoded UTF-8 string with null bytes and whitespace removed
   */
  extractString(length?: number) {
    // Read length prefix if not provided
    if (length === undefined) length = this.extractUInt16();
    const stringBuffer = this.#buffer.slice(this.#seekPosition, this.#seekPosition + length);
    const view = new Int8Array(stringBuffer);
    // Find actual string length by scanning for null terminator
    let stringLength = length;
    view.every((value: number, idx: number) => {
      if (value === 0) {
        stringLength = idx;
        return false; // Stop scanning
      } else return true;
    });
    // Decode and trim
    const value = this.#decoder.decode(stringBuffer);
    this.#seekPosition += length;
    return value.substring(0, stringLength).trim();
  }

  /**
   * Extract a single-character UTF-8 string.
   *
   * Convenience method for reading single-byte character fields.
   *
   * @returns Single character string
   */
  extractChar() {
    return this.extractString(1);
  }

  /**
   * Extract TACAN configuration (on/off, channel, XY, callsign).
   *
   * TACAN (Tactical Air Navigation) is a navigation system used by aircraft.
   * This extracts the complete TACAN configuration from the binary format.
   *
   * @returns BfisTacan object with all TACAN settings
   */
  extractTacan(): BfisTacan {
    return {
      isOn: this.extractBool(),
      channel: this.extractUInt8(),
      XY: this.extractChar(),
      callsign: this.extractString(4),
    };
  }

  /**
   * Extract radio configuration (frequency, callsign, callsignNumber).
   *
   * Radio frequencies are stored in Hz. Callsigns are numeric identifiers.
   *
   * @returns BfisRadio object with radio settings
   */
  extractRadio(): BfisRadio {
    return {
      frequency: this.extractUInt32(),
      callsign: this.extractUInt8(),
      callsignNumber: this.extractUInt8(),
    };
  }

  /**
   * Extract general engagement/prohibition settings.
   *
   * These settings control what actions a unit is allowed to perform
   * (e.g., prohibit jettison, prohibit air-to-air weapons).
   *
   * @returns BfisGeneralSettings object with all prohibition flags
   */
  extractGeneralSettings(): BfisGeneralSettings {
    return {
      prohibitJettison: this.extractBool(),
      prohibitAA: this.extractBool(),
      prohibitAG: this.extractBool(),
      prohibitAfterburner: this.extractBool(),
      prohibitAirWpn: this.extractBool(),
    };
  }

  /**
   * Extract ammo list from the buffer.
   *
   * Ammo lists are variable-length arrays. The format is:
   * - 16-bit count
   * - For each item: quantity, name (33 bytes), guidance, category, missileCategory
   *
   * @returns Array of BfisAmmo objects
   */
  extractAmmo(): BfisAmmo[] {
    const value: BfisAmmo[] = [];
    const size = this.extractUInt16();
    for (let idx = 0; idx < size; idx++) {
      value.push({
        quantity: this.extractUInt16(),
        name: this.extractString(33), // Fixed 33-byte string field
        guidance: this.extractUInt8(),
        category: this.extractUInt8(),
        missileCategory: this.extractUInt8(),
      });
    }
    return value;
  }

  /**
   * Extract contacts list (used for detection/visibility).
   *
   * Contacts represent units or weapons that are detected by this unit.
   * The format is:
   * - 16-bit count
   * - For each contact: ID (32-bit), detectionMethod (8-bit)
   *
   * @returns Array of BfisContact objects
   */
  extractContacts(): BfisContact[] {
    const value: BfisContact[] = [];
    const size = this.extractUInt16();
    for (let idx = 0; idx < size; idx++) {
      value.push({
        ID: this.extractUInt32(),
        detectionMethod: this.extractUInt8(),
      });
    }
    return value;
  }

  /**
   * Extract active path (waypoints) as a list of LatLng waypoints.
   *
   * Active paths represent the current route/waypoints for a unit.
   * The format is:
   * - 16-bit count
   * - For each waypoint: LatLng (lat, lng, alt, threshold)
   *
   * @returns Array of BfisLatLng waypoints
   */
  extractActivePath(): BfisLatLng[] {
    const value: BfisLatLng[] = [];
    const size = this.extractUInt16();
    for (let idx = 0; idx < size; idx++) {
      value.push(this.extractLatLng());
    }
    return value;
  }

  /**
   * Extract a 3D offset vector.
   *
   * Offsets are used for relative positioning (e.g., formation offsets).
   * Stored as three 64-bit floating-point values (x, y, z).
   *
   * @returns BfisOffset object with x, y, z coordinates
   */
  extractOffset(): BfisOffset {
    return {
      x: this.extractFloat64(),
      y: this.extractFloat64(),
      z: this.extractFloat64(),
    };
  }

  /**
   * Extract a single drawing argument (argument index + value).
   *
   * Drawing arguments are used for custom unit animations and visual effects.
   * Each argument has an index (32-bit) and a value (64-bit float).
   *
   * @returns BfisDrawingArgument object
   */
  extractDrawingArgument(): BfisDrawingArgument {
    return {
      argument: this.extractUInt32(),
      value: this.extractFloat64(),
    };
  }

  /**
   * Extract an array of drawing arguments.
   *
   * The format is:
   * - 16-bit count
   * - For each argument: index (32-bit), value (64-bit float)
   *
   * @returns Array of BfisDrawingArgument objects
   */
  extractDrawingArguments(): BfisDrawingArgument[] {
    const value: BfisDrawingArgument[] = [];
    const size = this.extractUInt16();
    for (let idx = 0; idx < size; idx++) {
      value.push(this.extractDrawingArgument());
    }
    return value;
  }
}
