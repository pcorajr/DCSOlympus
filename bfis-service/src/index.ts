/**
 * Main entry point for BFIS service.
 * 
 * Per spec: BFIS operates in two main modes that share the same core loop:
 * - Autopilot: BFIS passively watches DCSOlympus, decides on actions on its own,
 *   and issues commands back to DCSOlympus
 * - Copilot: the player actively talks to BFIS, and BFIS uses an LLM to turn that
 *   intent into concrete actions and DCSOlympus commands
 * 
 * Main loop orchestrates:
 * 1. SnapshotReader → polls Olympus, builds snapshot
 * 2. Decider → takes snapshot + intent, produces BfisDecision
 * 3. CommandAdapter → maps actions to Olympus commands, sends them
 * 4. Logger → writes NDJSON decision log
 * 
 * The same machinery works whether BFIS is quietly automating background decisions
 * or acting as a chatty, voice-driven copilot.
 * 
 * TODO: Implement main decision loop with polling intervals and graceful shutdown.
 */

