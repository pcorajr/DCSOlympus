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
export {};
