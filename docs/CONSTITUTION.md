<!--
Sync Impact Report:
- Version: 1.0.0 → 1.1.0
- Rationale: Added Article IX - Code Quality Standards to strengthen code quality principles
- Ratification Date: TODO (to be determined from project history)
- Last Amended: 2025-01-16
- Modified sections: Added Article IX (Code Quality Standards), kept Article X (Amendment and Evolution)
- Templates requiring updates: ✅ Updated - .specify/memory/constitution.md updated
-->

# DCS Olympus + BFIS Constitutional Charter

**Constitution Version:** 1.1.0  
**Ratification Date:** TODO (to be determined from project history)  
**Last Amended:** 2025-01-16

---

## Article I – Preamble

This constitution governs all work within the DCSOlympus repository, including the BFIS (Battlefield Intelligence Service) sidecar.  
It exists to keep the project fun, understandable, and sustainable while respecting clear architectural boundaries:

- **DCSOlympus runs the world** – it is the single source of truth for mission state and the only service that talks directly to DCS.
- **BFIS is the brain in the corner** – an external intelligence and decision service that observes Olympus state, decides what should happen, issues commands back to Olympus, and logs its decisions.
- **Specifications become law** – architecture is defined by the constitution and integration docs, not by ad‑hoc code or shortcuts.

All contributors (human or AI) must treat this document as the highest‑level authority for design, structure, and behavior in this repository.

---

## Article II – Scope, Hierarchy, and Sources of Truth

1. **Scope**
   - This constitution applies to the entire `DCSOlympus` repository.
   - It is especially binding for:
     - `bfis-service/` (BFIS sidecar implementation)
     - `shared-schemas/` (shared TypeScript data contracts)
     - `docs/integration/bfis/` (BFIS design and integration documentation)

2. **Hierarchy of authority**
   - **1. This constitution (`docs/CONSTITUTION.md`)**
   - **2. BFIS design docs:**  
     - `docs/integration/bfis/BFIS-service-definition.md`  
     - `docs/integration/bfis/bfis_olympus_integration_strategy.md`
   - **3. Shared schemas:** `shared-schemas/index.ts`
   - **4. Service code and scripts:** `bfis-service/` and other directories
   - **5. Local conventions and comments within files**

   If documents conflict, higher levels override lower levels. Code must be refactored to match the constitution and integration docs, not the other way around.

3. **State authority**
   - DCSOlympus remains the **only** authority on mission state and the only code allowed to talk to DCS (DLL/Lua/mission internals).
   - BFIS and any other services must consume Olympus’ public APIs and never become a second source of truth.

4. **Whitelisted implementation areas**
   - Write access for new code and automated changes is **whitelisted** to:
     - `bfis-service/**` – BFIS sidecar implementation.
     - `shared-schemas/**` – shared TypeScript data contracts for BFIS ⇄ Olympus.
     - `docs/**` – documentation, specifications, and this constitution.
   - All other directories (including `backend/`, `frontend/`, `mod/`, and similar Olympus code) are **read-only reference** and must not be modified by BFIS work or automation.

---

## Article III – Project Philosophy & Constraints

This is a **personal hobby project**, not enterprise software. All decisions must respect the following principles:

1. **Optimize for the real world**
   - Hardware limitations are real – build for the machines you actually have.
   - Time is limited – prefer working, understandable solutions over idealized architecture.

2. **Learning and enjoyment**
   - The project must remain a place to learn and experiment.
   - Work should be enjoyable; if a path kills the fun, reconsider the path.

3. **Transparency and auditability**
   - Every meaningful decision (architecture, behavior, or automation) should be explainable and traceable.
   - NDJSON decision logs for BFIS are a core mechanism for this transparency.

4. **Human‑in‑the‑loop by default**
   - AI assists; humans decide.
   - Autopilot is allowed, but must remain interpretable, controllable, and easy to disable.

5. **Clean, maintainable code over cleverness**
   - Code you can understand in six months is more valuable than clever tricks.
   - Avoid unnecessary abstractions and over‑engineering.

6. **Genuine utility over feature creep**
   - Build features that genuinely improve the experience or capabilities of Olympus and BFIS.
   - Limit “cool but unused” features unless they directly serve learning goals.

7. **Practical quality**
   - Test critical paths and logic that tends to break.
   - Profile before optimizing; “good enough” performance is acceptable for hobby scale.
   - Document the non‑obvious: setup, workflows, and any surprising design choices.

---

## Article IV – Architectural Order: Olympus and BFIS

1. **Olympus as the game room**
   - Olympus owns live mission state, talks to DCS (DLL/Lua), and serves the web UI.
   - Existing Olympus flows (frontend ↔ backend ↔ DCS) are treated as **upstream** and must remain intact.
   - BFIS and other services must treat Olympus as the only gateway into DCS.
   - **Direct modification of DCSOlympus core code is strictly forbidden.** The Olympus code in this repository is treated as read‑only reference material so BFIS and other tools know what they are integrating with and coding against.

2. **BFIS as a sidecar**
   - BFIS is a **separate service** that lives in `bfis-service/` with its own `package.json`, Docker configuration, and runtime.
   - BFIS **only** talks to Olympus over existing, public HTTP APIs (REST and binary streams).
   - BFIS **never** talks directly to DCS, modifies the DLL, or alters Olympus’ core DCS connectors.

3. **Single conversation pattern**
   - BFIS follows a simple, repeatable loop:
     - **Read state** – poll Olympus endpoints, decode binary/JSON data, and build an `OlympusSnapshot`.
     - **Understand intent** – from autonomous goals (Autopilot) or player instructions (Copilot).
     - **Decide** – produce `BfisDecision` objects as typed actions.
     - **Command** – map actions to existing Olympus commands and drive the async `commandHash` flow.
     - **Log** – write a single NDJSON record per decision cycle with stable, replay‑friendly fields.
   - New features must be expressed in terms of this loop instead of inventing parallel systems.

4. **Autopilot and Copilot modes**
   - **Autopilot** – BFIS observes and acts autonomously, within configured limits.
   - **Copilot** – BFIS interprets player intent (text/voice) into concrete actions, often asking for confirmation.
   - Both modes use the same snapshot/decision/command/log machinery; they differ only in where intent originates and how explicit confirmation is.

5. **Strict separation of concerns**
   - BFIS must not:
     - Rebuild coordinate systems or mapping layers already handled by Olympus.
     - Implement its own DCS connector, Lua scripts, or DLL.
     - Replace Olympus’ UI or act as a competing world state authority.
   - Whenever BFIS logic starts to duplicate Olympus responsibilities, the default answer is:
     > “Let Olympus handle that; BFIS only needs the results.”

---

## Article V – Code Synergy & Integration

1. **Synergy with Olympus**
   - New BFIS code must complement Olympus, not fight it.
   - Prefer reusing existing Olympus patterns, naming, and structures where reasonable.

2. **Respect interfaces and data contracts**
   - `shared-schemas/index.ts` is the canonical source of truth for BFIS ⇄ Olympus data shapes.
   - Both Olympus and BFIS must import from shared schemas instead of re‑defining overlapping types.
   - Integration behavior is described in the BFIS docs under `docs/integration/bfis/` and must be kept in sync with code.

3. **Align with established patterns**
   - Follow DCSOlympus conventions for module layout, file naming, and separation of concerns.
   - Keep data access, decision logic, and transport concerns decoupled.

4. **Encapsulate complexity**
   - Use focused helpers or modules (for example, Snapshot Reader, Command Adapter, NDJSON Logger) to hide low‑level details behind clear interfaces.
   - Complex logic should live in well‑named, testable units rather than sprawling across the codebase.

5. **Docker and runtime isolation**
   - BFIS is expected to run as a Dockerized service alongside Olympus, but this is an implementation detail; the architectural contract (HTTP APIs + shared schemas) must remain valid regardless of deployment method.

---

## Article VI – Constitutional Foundation & Specification‑Driven Development

1. **Constitution as architectural DNA**
   - This constitution is the **architectural DNA** of the DCSOlympus + BFIS ecosystem.
   - It defines immutable principles that govern how specifications become code.

2. **Specs first, code second**
   - Significant changes to BFIS behavior, Olympus integration, or shared schemas must be:
     - Described or updated in `docs/integration/bfis/` and/or this constitution.
     - Then implemented in code to match the updated specification.
   - Code that diverges from the written spec is considered **out of order** and must be reconciled.

3. **Shared schemas as contract**
   - `shared-schemas/index.ts` embodies the BFIS ⇄ Olympus contract in code.
   - Changes to shared types require deliberate consideration of backward compatibility and their impact on both sides of the integration.

4. **AI and tool alignment**
   - All AI agents and automation tools must treat this constitution and the BFIS integration docs as primary context.
   - Generated implementations must include short, human‑readable rationales that connect code to the relevant specs.

---

## Article VII – Logging, Transparency, and Accountability

1. **NDJSON decision logs as a first‑class artifact**
   - Every BFIS decision cycle must produce exactly one NDJSON record capturing:
     - Snapshot metadata, decision metadata, actions, and Olympus command linkage.
   - Logs must favor summaries and hashes over raw prompts and full snapshots by default.

2. **Replay and analysis**
   - Logs are designed to support replay and debugging of BFIS behavior.
   - Changes that would undermine replayability (for example omitting essential identifiers or decoupling actions from command hashes) are contrary to this constitution.

3. **Privacy and safety**
   - When logging user intent or model prompts, prefer summarized or hashed forms unless full text is explicitly needed for debugging.
   - Do not log sensitive information unnecessarily.

---

## Article VIII – AI Agents, Automation, and Human Oversight

1. **Role of AI agents**
   - AI agents (including Codex, Cursor, and others) are assistants, not autonomous owners.
   - They must:
     - Explain non‑trivial changes and decisions.
     - Preserve readability and avoid unnecessary complexity.
     - Respect architectural boundaries between Olympus and BFIS.

2. **Human‑in‑the‑loop enforcement**
   - Humans retain final authority over architecture and behavior.
   - Automated changes that deviate from the constitution must be rejected or revised.

3. **Traceability of changes**
   - Agents and humans should maintain clear commit messages and, when appropriate, short ADRs or notes connecting changes back to this constitution and the BFIS integration docs.

---

## Article IX – Code Quality Standards

1. **Documentation in code (NON-NEGOTIABLE)**
   - All documentation MUST be in code – no separate markdown documentation files (except minimal README for setup).
   - Comprehensive JSDoc/TSDoc comments are required for all public APIs, classes, functions, and types.
   - Inline comments must explain "why" for non-obvious decisions, not just "what" the code does.
   - Type definitions must include field descriptions and usage examples where helpful.
   - Code structure and organization should be self-documenting through clear naming and logical grouping.

2. **Type safety and error handling**
   - TypeScript strict mode is required for all new BFIS code.
   - Shared schemas (`shared-schemas/index.ts`) must be fully typed and serve as the single source of truth.
   - Error handling must be explicit – avoid silent failures. Log errors with context for debugging.
   - Use discriminated unions and type guards for runtime type safety where appropriate.

3. **Code organization and structure**
   - Follow the established module pattern: focused, single-responsibility modules with clear interfaces.
   - Keep data access, business logic, and transport concerns decoupled.
   - Prefer composition over inheritance. Use interfaces and abstract classes sparingly, only when they add genuine value.
   - File and directory names must clearly indicate purpose and follow project conventions.

4. **Testing approach**
   - Test critical paths and logic that tends to break (integration points, decision logic, data transformations).
   - Unit tests for complex algorithms and business logic.
   - Integration tests for BFIS ⇄ Olympus contract compliance (shared schemas, command mapping).
   - No test coverage requirements, but tests must be meaningful and maintainable.

5. **Code review and quality gates**
   - All code changes must be reviewed for compliance with this constitution.
   - Code must be readable by someone who didn't write it (the "six months later" test).
   - Linting and formatting should be automated (ESLint, Prettier) but not block progress if tools are imperfect.
   - Complexity must be justified – if code is hard to understand, add comments or refactor, don't add more complexity.

6. **AI-generated code standards**
   - AI-generated code must include JSDoc comments explaining the rationale and connection to specifications.
   - Generated code must respect architectural boundaries (no direct DCS access, no Olympus core modifications).
   - All AI-generated implementations must be reviewed by humans before merging.
   - Placeholder code must be clearly marked with TODO comments and include implementation notes.

---

## Article X – Amendment and Evolution

1. **Amending the constitution**
   - This document may evolve, but never casually.
   - Material changes require:
     - An explicit rationale (why the change is needed).
     - Consideration of impact on existing code, docs, and workflows.
     - Updates to any affected integration docs and shared schemas.

2. **Backward compatibility and migration**
   - When breaking changes are unavoidable, they must include a migration plan or clear upgrade notes.

3. **Continuous improvement, not churn**
   - Refactor and improve progressively; avoid large, destabilizing rewrites.
   - Complexity must always be justified against the project philosophy and the need to keep the project fun, understandable, and maintainable.

---

By working in this repository, you agree to uphold this constitution, treat Olympus as the authoritative game room, treat BFIS as the brain in the corner, and ensure that all specifications, implementations, and tools respect the architectural order, simplicity, and transparency it mandates.
