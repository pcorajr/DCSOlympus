<!--
Sync Impact Report:
- Version: 1.0.0 → 1.1.0
- Rationale: Added Code Quality Standards principle (VIII) to align with Article IX in docs/CONSTITUTION.md
- Ratification Date: TODO (to be determined from project history)
- Last Amended: 2025-01-16
- Modified sections: Added Principle VIII (Code Quality Standards)
- Templates requiring updates: ✅ Updated this template
-->

# DCS Olympus + BFIS Constitution

## Core Principles

### I. Optimize for the Real World
Hardware limitations are real – build for the machines you actually have. Time is limited – prefer working, understandable solutions over idealized architecture.

### II. Learning and Enjoyment
The project must remain a place to learn and experiment. Work should be enjoyable; if a path kills the fun, reconsider the path.

### III. Transparency and Auditability (NON-NEGOTIABLE)
Every meaningful decision (architecture, behavior, or automation) should be explainable and traceable. NDJSON decision logs for BFIS are a core mechanism for this transparency.

### IV. Human-in-the-Loop by Default
AI assists; humans decide. Autopilot is allowed, but must remain interpretable, controllable, and easy to disable.

### V. Clean, Maintainable Code Over Cleverness
Code you can understand in six months is more valuable than clever tricks. Avoid unnecessary abstractions and over-engineering.

### VI. Genuine Utility Over Feature Creep
Build features that genuinely improve the experience or capabilities of Olympus and BFIS. Limit "cool but unused" features unless they directly serve learning goals.

### VII. Practical Quality
Test critical paths and logic that tends to break. Profile before optimizing; "good enough" performance is acceptable for hobby scale. Document the non-obvious: setup, workflows, and any surprising design choices.

### VIII. Code Quality Standards (NON-NEGOTIABLE)
**Documentation in code:** All documentation MUST be in code – comprehensive JSDoc/TSDoc for all public APIs, classes, functions, and types. Inline comments explain "why" for non-obvious decisions. No separate markdown documentation files except minimal README for setup.

**Type safety and error handling:** TypeScript strict mode required. Shared schemas must be fully typed. Error handling must be explicit with context for debugging.

**Code organization:** Follow established module pattern with focused, single-responsibility modules. Keep data access, business logic, and transport concerns decoupled. File and directory names must clearly indicate purpose.

**Testing approach:** Test critical paths and logic that tends to break. Unit tests for complex algorithms. Integration tests for BFIS ⇄ Olympus contract compliance. No coverage requirements, but tests must be meaningful.

**Code review standards:** Code must be readable by someone who didn't write it (the "six months later" test). Complexity must be justified. AI-generated code must include JSDoc explaining rationale and connection to specifications.

## Architectural Order: Olympus and BFIS

**Olympus as the game room:** Olympus owns live mission state, talks to DCS (DLL/Lua), and serves the web UI. Existing Olympus flows (frontend ↔ backend ↔ DCS) are treated as upstream and must remain intact. BFIS and other services must treat Olympus as the only gateway into DCS. Direct modification of DCSOlympus core code is strictly forbidden.

**BFIS as a sidecar:** BFIS is a separate service that lives in `bfis-service/` with its own package.json, Docker configuration, and runtime. BFIS only talks to Olympus over existing, public HTTP APIs (REST and binary streams). BFIS never talks directly to DCS, modifies the DLL, or alters Olympus' core DCS connectors.

**Single conversation pattern:** BFIS follows a simple, repeatable loop: Read state → Understand intent → Decide → Command → Log. New features must be expressed in terms of this loop instead of inventing parallel systems.

**Autopilot and Copilot modes:** Autopilot – BFIS observes and acts autonomously, within configured limits. Copilot – BFIS interprets player intent (text/voice) into concrete actions, often asking for confirmation. Both modes use the same snapshot/decision/command/log machinery.

**Strict separation of concerns:** BFIS must not rebuild coordinate systems, implement its own DCS connector, or replace Olympus' UI. Whenever BFIS logic starts to duplicate Olympus responsibilities, the default answer is: "Let Olympus handle that; BFIS only needs the results."

## Specification-Driven Development and Integration

**Specs first, code second:** Significant changes to BFIS behavior, Olympus integration, or shared schemas must be described or updated in `docs/integration/bfis/` and/or this constitution, then implemented in code to match the updated specification. Code that diverges from the written spec is considered out of order and must be reconciled.

**Shared schemas as contract:** `shared-schemas/index.ts` embodies the BFIS ⇄ Olympus contract in code. Changes to shared types require deliberate consideration of backward compatibility and their impact on both sides of the integration.

**Respect interfaces and data contracts:** Both Olympus and BFIS must import from shared schemas instead of re-defining overlapping types. Integration behavior is described in the BFIS docs under `docs/integration/bfis/` and must be kept in sync with code.

**NDJSON decision logs as first-class artifact:** Every BFIS decision cycle must produce exactly one NDJSON record capturing snapshot metadata, decision metadata, actions, and Olympus command linkage. Logs must favor summaries and hashes over raw prompts and full snapshots by default.

**AI and tool alignment:** All AI agents and automation tools must treat this constitution and the BFIS integration docs as primary context. Generated implementations must include short, human-readable rationales that connect code to the relevant specs.

## Governance

This constitution is the architectural DNA of the DCSOlympus + BFIS ecosystem. It defines immutable principles that govern how specifications become code.

**Hierarchy of authority:**
1. This constitution (`docs/CONSTITUTION.md`)
2. BFIS design docs: `docs/integration/bfis/BFIS-service-definition.md`, `docs/integration/bfis/bfis_olympus_integration_strategy.md`
3. Shared schemas: `shared-schemas/index.ts`
4. Service code and scripts: `bfis-service/` and other directories
5. Local conventions and comments within files

If documents conflict, higher levels override lower levels. Code must be refactored to match the constitution and integration docs, not the other way around.

**Amending the constitution:** This document may evolve, but never casually. Material changes require: an explicit rationale (why the change is needed), consideration of impact on existing code/docs/workflows, and updates to any affected integration docs and shared schemas.

**Whitelisted implementation areas:** Write access for new code and automated changes is whitelisted to: `bfis-service/**`, `shared-schemas/**`, `docs/**`. All other directories (including `backend/`, `frontend/`, `mod/`) are read-only reference and must not be modified by BFIS work or automation.

**Human-in-the-loop enforcement:** Humans retain final authority over architecture and behavior. Automated changes that deviate from the constitution must be rejected or revised. AI agents are assistants, not autonomous owners.

**Version**: 1.1.0 | **Ratified**: TODO (to be determined from project history) | **Last Amended**: 2025-01-16
