/**
 * Dialogue Manager - Manages conversation context for Copilot mode.
 *
 * Per spec: In Copilot mode, the player actively talks to BFIS (text or voice),
 * and BFIS uses an LLM to turn that intent into concrete actions.
 *
 * This component:
 * - Manages conversations with the player and models
 * - Accepts natural-language input, keeps lightweight dialogue context
 * - Uses an LLM to interpret "what the user really wants" in terms of BFIS actions
 *
 * The same machinery works whether BFIS is quietly automating background decisions
 * or acting as a chatty, voice-driven copilot; the only difference is where the
 * intent comes from (BFIS itself vs. the player).
 *
 * Implementation approach:
 * - Maintain conversation history (last N messages for context)
 * - Track user intent and BFIS responses
 * - Prepare prompts for LLM with conversation context
 * - Optionally propose actions before executing (for Copilot mode)
 *
 * TODO: Implement dialogue management and context tracking.
 */
