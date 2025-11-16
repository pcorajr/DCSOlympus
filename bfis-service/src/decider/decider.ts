/**
 * Decider - Core decision logic for BFIS.
 * 
 * Per spec: The Decider takes the latest snapshot plus either:
 * - Autonomous goals (Autopilot mode) - BFIS decides on its own using rules and/or LLMs
 * - Interpreted player intent (Copilot mode) - Player tells BFIS what to do
 * 
 * And produces a BfisDecision (a list of typed actions with targets and parameters).
 * 
 * Responsibilities:
 * - Understanding intent: combining game state with either BFIS's own goals or
 *   the player's natural-language instructions (via LLM) into a clear set of actions
 * - Deciding actions: choosing or co-designing actions such as spawns, moves, attacks,
 *   ROE changes, or scenario-building steps
 * 
 * For MVP, this can be rules-based. Future: LLM-powered decision-making.
 * 
 * TODO: Implement decision logic (rules-based for MVP, LLM-powered for future).
 */
