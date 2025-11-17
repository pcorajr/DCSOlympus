/**
 * Internal-only types for BFIS service.
 *
 * These types are not part of the shared schema contract with Olympus.
 * They are used internally for state management, polling, and service logic.
 *
 * Per constitution: Internal types should be kept separate from shared schemas
 * to maintain clear boundaries between BFIS internals and the BFIS ⇄ Olympus contract.
 *
 * This file intentionally mirrors some Olympus frontend / Python structures
 * (LatLng, TACAN, Radio, GeneralSettings, Ammo, Contact, Offset, DrawingArgument)
 * for use in BFIS binary decoding and internal state. These are not exposed as
 * part of the shared BFIS ⇄ Olympus contract.
 */

/**
 * 3D geographic coordinate with optional threshold used by Olympus for
 * proximity checks.
 *
 * This mirrors the Olympus frontend LatLng structure for binary decoding.
 * The threshold field is present in the binary format but may not always be
 * needed by BFIS decision logic.
 */
export interface BfisLatLng {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lng: number;
  /** Altitude in meters above sea level */
  alt: number;
  /**
   * Optional threshold for proximity checks (meters).
   * This is present in the binary format but not always needed by BFIS.
   */
  threshold?: number;
}

/**
 * TACAN (Tactical Air Navigation) configuration.
 *
 * TACAN is a navigation system that provides bearing and distance information.
 * This structure matches the Olympus binary format for TACAN data.
 */
export interface BfisTacan {
  /** Whether TACAN is turned on */
  isOn: boolean;
  /** TACAN channel number */
  channel: number;
  /** TACAN XY mode (single-character string: 'X' or 'Y') */
  XY: string;
  /** TACAN callsign (up to 3 characters) */
  callsign: string;
}

/**
 * Radio configuration for unit communications.
 *
 * Radio frequencies are stored in Hz. Callsigns are numeric identifiers
 * used for unit identification in communications.
 */
export interface BfisRadio {
  /** Radio frequency in Hz */
  frequency: number;
  /** Radio callsign (numeric part) */
  callsign: number;
  /** Radio callsign suffix number */
  callsignNumber: number;
}

/**
 * General engagement and weapon prohibition settings.
 *
 * These flags control what actions a unit is allowed to perform.
 * Used for ROE (Rules of Engagement) enforcement.
 */
export interface BfisGeneralSettings {
  /** Prohibit jettisoning stores/weapons */
  prohibitJettison: boolean;
  /** Prohibit air-to-air weapons */
  prohibitAA: boolean;
  /** Prohibit air-to-ground weapons */
  prohibitAG: boolean;
  /** Prohibit afterburner usage */
  prohibitAfterburner: boolean;
  /** Prohibit air weapons (general) */
  prohibitAirWpn: boolean;
}

/**
 * Ammunition/weapon inventory for a unit.
 *
 * Contains information about remaining weapons, their guidance systems,
 * and categories. Used for tracking unit combat readiness.
 */
export interface BfisAmmo {
  /** Remaining quantity of this ammo type */
  quantity: number;
  /** Weapon/ammo name */
  name: string;
  /** Guidance system type (numeric code) */
  guidance: number;
  /** Weapon category (numeric code) */
  category: number;
  /** Missile category (numeric code) */
  missileCategory: number;
}

/**
 * Contact represents a detected unit or weapon.
 *
 * Contacts are used for tracking what units can "see" or detect.
 * The detectionMethod indicates how the contact was detected (radar, visual, etc.).
 */
export interface BfisContact {
  /** ID of the detected unit or weapon */
  ID: number;
  /** Detection method bitfield/index */
  detectionMethod: number;
}

/**
 * 3D offset vector for relative positioning.
 *
 * Used for formation offsets, relative waypoints, and other spatial relationships.
 * Coordinates are in meters relative to a reference point.
 */
export interface BfisOffset {
  /** X offset in meters */
  x: number;
  /** Y offset in meters */
  y: number;
  /** Z offset in meters */
  z: number;
}

/**
 * Drawing argument for custom unit animations and visual effects.
 *
 * Drawing arguments control visual aspects of units in DCS (e.g., landing gear,
 * weapon bay doors, custom animations). Each argument has an index and a value.
 */
export interface BfisDrawingArgument {
  /** Argument index (which visual element to control) */
  argument: number;
  /** Argument value (position, state, etc.) */
  value: number;
}
