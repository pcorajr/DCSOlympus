/**
 * Command Adapter - Maps BFIS actions to Olympus commands.
 * 
 * Per spec: The Command Adapter maps each BFIS action to a concrete Olympus command
 * name and parameter payload, sends it via the async command API, and tracks
 * command hashes and statuses.
 * 
 * Responsibilities:
 * - Issuing commands: mapping BFIS actions to real DCSOlympus commands
 * - Driving the async commandHash flow until completion
 * 
 * Command flow (per spec):
 * - PUT /olympus/command → returns commandHash
 * - GET /olympus/commands?commandHash=... → returns commandExecuted + commandResult
 * 
 * BFIS action → Olympus command mapping table needs to be built:
 * - SPAWN → spawnUnits / spawnAircrafts
 * - MOVE → setGroupRoute
 * - ATTACK → (TBD based on Olympus command API)
 * - etc.
 * 
 * TODO: Implement command mapping and async command flow tracking.
 */

