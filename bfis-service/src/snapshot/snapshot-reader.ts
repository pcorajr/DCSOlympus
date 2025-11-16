/**
 * Snapshot Reader - Polls Olympus endpoints and builds normalized snapshots.
 * 
 * Per spec: This component is responsible for:
 * - Ingesting state: polling DCSOlympus for mission state, units, weapons, and logs
 * - Turning that into a compact internal snapshot (OlympusSnapshot)
 * 
 * Polling strategy (MVP default):
 * - Units/weapons (binary): every 2000ms (full + incremental as needed)
 * - Logs: every 1000-2000ms
 * - Mission/airbases/bullseyes/spots/drawings: every 5000-10000ms
 * 
 * The reader polls Olympus endpoints, decodes binary/JSON responses, and produces
 * a normalized OlympusSnapshot for the rest of the service.
 * 
 * TODO: Implement polling logic for all Olympus endpoints.
 */
