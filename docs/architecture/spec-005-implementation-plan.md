# Spec-005 Implementation Plan – Human-in-the-Loop Chat Interface for BFIS

This plan translates Spec-005 into concrete implementation steps for BFIS, with code-level guidance and guardrails. Scope is limited to `bfis-service/**`, `shared-schemas/**`, and `docs/**` per constitution/AGENTS.

## Objectives
- Enforce human-in-the-loop: no autonomous execution without explicit approval.
- Make chat → LLM → Intel tools → action proposal → approval → execution reliable and observable.
- Standardize tool calling (recommend MCP-style router) and structured logging/NDJSON.
- Keep polling decoupled from inference; orchestration only runs when explicitly enabled.

## Constraints and Defaults
- Config defaults: `chat.enabled=true`, `chat.allowAutonomous=false`, `polling.triggerOrchestrator=false`, `chat.approvalTimeoutMs=300000`.
- Tests must run in Docker: `docker compose run --rm bfis-service-dev npm test`.
- No changes to `backend/`, `frontend/`, or `mod/`.
- Structured logging only (StructuredLogger + NDJSON decision logs); no ad-hoc `console.log`.

## Work Breakdown

### 1) Approval Hardening
- Bind approvals to session:
  ```ts
  // src/chat/action-approval.ts
  async processApproval(decisionId: string, approved: boolean, sessionId: string) {
    const pending = this.pendingDecisions.get(decisionId);
    if (!pending || pending.sessionId !== sessionId) throw new Error("Decision not found for session");
    // existing status/expiry checks...
  }
  ```
  Update caller (`DialogueManager.executeApprovedActions`) to pass `sessionId`.

- Enforce approval in all execution paths:
  - `WriterAgent.executeCommands` should require `approved === true`; otherwise throw. Log `approvedBy`.
  - `Orchestrator.runCycle` should **not** call Writer in chat-only mode unless `chat.allowAutonomous === true` and `polling.triggerOrchestrator === true`; otherwise skip with a log.
  - When autonomous is enabled, the orchestrator explicitly passes `approved=true`/`approvedBy="autonomous"` so Writer does not reject.

- Prevent cross-session approvals in HTTP:
  ```ts
  // src/chat/http-server.ts: POST /bfis/chat/approve
  await dialogueManager.executeApprovedActions({ sessionId, decisionId, approved });
  ```

### 2) Dialogue Manager Refactor
- Use LLM proposals directly instead of recomputing:
  - Parse the JSON block from the LLM response and validate against `BfisDecision` shape (actions, reasoning).
  - Store the proposed decision with `ActionApprovalManager.proposeDecision`.
  - Avoid calling `commanderAgent.makeDecision` when the LLM already proposed actions.

- Provide full, consistent mission state to the LLM:
  - Build a single snapshot per message in `processMessage()` via `readContextOnce()` and pass it through the flow (LLM tools, proposal parsing, approval execution).
  - Derive `intelSummary` and `missionContext` from that snapshot (including hostilities flag, mission/server IDs, sessionHash, time).
  - When tools are invoked, hand them the already-fetched snapshot instead of letting each tool call `readContextOnce()` again.
  - Persist the same snapshot through `parseLLMResponse()` so action proposals and Commander finalization operate on identical state; add a new hook (e.g., `processMessage({ ..., snapshot })` -> `parseLLMResponse(..., snapshot)` -> `executeApprovedActions(..., snapshot?)`).
  - If multiple tool calls occur in one response, reuse the same snapshot to avoid duplicated pulls and to guarantee consistency.
  - Hostility guard: strip ATTACK actions on approval if `hostilitiesStarted === false`.
  - Enrich intel tools to surface counts by unit type for aircraft (e.g., IL-76, B-1B) so the LLM can answer type-specific queries without recomputation; add `get_aircraft_breakdown` tool that returns `totalAircraft`, `byType`, and a sample list.

- Add a proposal API on Commander for when LLM returns intent only:
  ```ts
  // src/agents/commander-agent.ts
  async generateProposal(input: { humanIntent: string; intelSummary: TacticalSummary; missionContext: MissionContext; history: ChatMessage[] }): Promise<BfisDecision> { ... }
  async finalizeDecision(proposed: BfisDecision, missionContext: MissionContext): Promise<BfisDecision> { ... }
  ```

- Carry real context:
  - Fetch snapshot once per message: `const snapshot = await snapshotReader.readContextOnce();`
  - Build `intelSummary` via IntelAgent (see Section 3).
  - Pass `hostilitiesStarted` from snapshot, not default `false`.

- Conversation/session handling:
  - Track `sessionHash` per session; store alongside history.
  - Enforce history length (`maxHistoryLength`) and optionally truncate message size.

- Structured logging (no `console.log`):
  - Log prompt length, tool calls, proposal created, approval requested, and errors via StructuredLogger.

### 3) Intel Tools Using Real Summaries
- Expose public helpers on IntelAgent:
  ```ts
  // src/agents/intel-agent.ts
  async buildSummary(snapshot: BfisContextSnapshot): Promise<TacticalSummary> { ... } // move current private logic here
  async detectChanges(current, previous): Promise<SnapshotDelta | undefined> { ... }   // move current private logic here
  ```

- Rework tools to use IntelAgent and session-aware caches:
  ```ts
  // src/agents/tools/intel-tools.ts
  export function createIntelTools(intelAgent, { snapshot, sessionId, previousSnapshots }) {
    const getSummary = tool(async () => intelAgent.buildSummary(snapshot), { name: "get_battlefield_summary", schema: z.object({}) });
    const getUnitInfo = tool(async (params) => { /* filters + countsByType, uses snapshot */ }, { ...unitType via unitType/name... });
    const getAircraftBreakdown = tool(async () => { /* byType counts + samples for AIRPLANE */ }, { name: "get_aircraft_breakdown", schema: z.object({}) });
    const getRecentChanges = tool(async () => { const prev = previousSnapshots.get(sessionId); /* detectChanges */ }, { name: "get_recent_changes", schema: z.object({}) });
    return [getSummary, getUnitInfo, getAircraftBreakdown, getRecentChanges];
  }
  ```
  - Avoid stringified returns; let the LLM client serialize.
  - Require the caller (DialogueManager) to provide the snapshot to each tool invocation to guarantee consistency and eliminate redundant network calls.
  - `get_unit_info` now returns `countsByType` and up to 50 samples, enabling answers like “Is there 6 IL-76?” without extra queries.

### 4) LLM Tool Routing (MCP-Style Recommendation)
- Replace ad-hoc JSON protocol with a structured router:
  - Define `ToolCallRequest { name; args; }`, `ToolCallResult { name; ok; data|error; }`.
  - Validate args against zod schema before invoking tools; return structured error on validation fail.
  - Emit logs: `bfis-llm-tool-request`, `bfis-llm-tool-success`, `bfis-llm-tool-error`.
  - Strip all `console.log/warn`; use StructuredLogger.

- If adopting true MCP:
  - Implement MCP server that exposes the same tool set; adjust LLM client to send MCP-native tool calls.
  - Benefit: native tool calling in many LLM frameworks; fewer parsing hacks.

- LLM response parsing:
  - Support both native tool calls (when available) and JSON fallback.
  - When no tool call: return content.
  - When tool call: execute tool, then run a second completion with tool result (current pattern), but ensure consistent structured logging.

### 5) Approval → Execution Pipeline
- DialogueManager `executeApprovedActions`:
  - `processApproval(decisionId, approved, sessionId)`.
  - On approve: `finalizeDecision` (Commander) with fresh mission context and hostility state.
  - Pass `approved=true`, `approvedBy=sessionId` to Writer.
  - Always remove decision from pending map after processing.
  - Before execution, strip ATTACK actions if hostilities have not started to enforce FR-010 safety.

- Writer enforcement:
  - Require `approved === true`; otherwise throw.
  - Hostility guard: if `hostilitiesStarted === false`, strip or reject ATTACK actions (reuse Commander logic or a shared helper).
  - Normalize `availableCommands` from one source (e.g., config or a constants module).

- NDJSON decision log:
  - Log proposal creation, approval/rejection, execution results with `decisionId`, `sessionId`, `snapshotId`, `hostilitiesStarted`, `actions`, `commandHashes`, `approvedBy`.

### 6) Polling Loop Safety
- Default: polling caches snapshots only (`triggerOrchestrator=false`).
- If both `triggerOrchestrator=true` and `chat.allowAutonomous=false`, log a warning and skip orchestration (safety net).
- On sessionHash change, reset change-detection caches for intel tools.

### 7) Packaging and Assets
- Align build/start:
  - Ensure `npm start` points to the emitted entry (`build/src/index.js` or adjust `tsconfig.outDir`).
  - Copy `src/chat/public` into `build/src/chat/public` (or similar) during build and serve from built path in `http-server.ts`.
    ```ts
    const publicPath = path.join(import.meta.dirname, "..", "chat", "public"); // built location
    app.use(express.static(publicPath));
    ```

### 8) Testing (Docker Only)
- Ensure tests transpile:
  - Option A: run tests via ts-node/register: `node --loader ts-node/esm --test`.
  - Option B: precompile tests to JS in build step and point `npm test` to built tests.

- Add/extend tests:
  - `src/chat/__tests__/action-approval.test.ts`: session binding, expiry, double-processing errors.
  - `src/chat/__tests__/dialogue-manager.test.ts`: proposal parsing uses LLM actions; approvals call Writer with `approvedBy`.
  - `src/agents/tools/__tests__/intel-tools.test.ts`: uses real IntelAgent.buildSummary/detectChanges and session-aware cache.
  - `src/intent/__tests__/llm-client.test.ts`: tool routing validates schema, logs errors, returns structured results.
  - Writer hostility guard test: ATTACK stripped when hostilities=false.

- Run: `docker compose run --rm bfis-service-dev npm test -- <path>` (no host execution).

### 9) Observability
- Structured logs for every step:
  - `bfis-dialogue-message-received`, `bfis-llm-tool-request`, `bfis-llm-tool-success/error`, `bfis-decision-proposed`, `bfis-decision-approved/rejected`, `bfis-writer-approved-execution`, `bfis-command-sent`, `bfis-command-failed`.
- NDJSON decision log per proposal/approval/execution for replay.

### 10) Migration/Config Notes
- Keep defaults non-autonomous. If enabling both `allowAutonomous=true` and `triggerOrchestrator=true`, emit a startup warning.
- Document any new env toggles (e.g., `BFIS_TOOL_ROUTER_MODE=mcp|local`) in `config.ts` JSDoc and README if added.

## Implementation Notes (Current State)
- Snapshot reuse: DialogueManager fetches one snapshot per message, injects it into intel tools, proposal parsing, and builds mission context/hostility state from it.
- Intel tools: Now use IntelAgent `buildSummary`/`detectChanges` with session-aware caches; tools return objects, not strings, and never re-fetch snapshots.
- Approval gates: Approvals are session-bound; Writer requires `approved===true`; orchestrator is blocked unless `chat.allowAutonomous` is true and passes explicit approval in that mode.
- Hostility safety: ATTACK actions are stripped at approval time if hostilities have not started.
- LLM tooling: Tool router uses structured logging hooks (via logger) and converts tool outputs to JSON safely (no `console.log`); tool args are schema-validated with injected snapshot data.
- Packaging: `npm start` targets `build/src/index.js`; build step copies `src/chat/public` into `build/src/chat/public`, and HTTP server prefers the built public path.
- Serving UI: HTTP server now chooses the built `chat/public` if present, falling back to source for dev.
 - Intel tools now include aircraft breakdown by type and unit-type counts in `get_unit_info`, enabling precise answers for “6 IL-76?” style questions without refetching snapshots.
## Minimal Code Skeletons (for reference)
- Session-bound approval:
  ```ts
  // dialogue-manager.ts
  const pending = await this.approvalManager.processApproval(decisionId, approved, sessionId);
  const finalized = await this.commanderAgent.finalizeDecision(pending.decision, missionContext);
  await this.writerAgent.executeCommands({ decision: finalized, availableCommands }, true, sessionId);
  ```
- Tool router logging:
  ```ts
  logger.info("bfis-llm-tool-request", { tool: req.name, sessionId, args: req.args });
  try { const data = await tool.invoke(req.args); logger.info("bfis-llm-tool-success", { tool: req.name }); }
  catch (err) { logger.error("bfis-llm-tool-error", { tool: req.name, error: err.message }); }
  ```

## Completion Definition
- Chat flow: human message → (tools as needed) → LLM proposal with actions → stored pending decision → approval → Writer executes only with approval, logs NDJSON.
- Hostility and session guards enforced; autonomous execution disabled by default.
- Tool calling robust with schema validation and structured logs; Intel data accurate and session-aware.
- Build/start works in prod; chat UI served from build; tests runnable in Docker and cover approval/tool/hostility paths.
