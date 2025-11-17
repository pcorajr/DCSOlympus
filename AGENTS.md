# AI Agents Guide

This document provides guidance for AI agents (including Cursor, Claude, and other AI assistants) working in the DCSOlympus repository.

## Authority and Hierarchy

**The constitution is the highest authority.** All agents MUST read and comply with:
- `docs/CONSTITUTION.md` - Full constitutional charter
- `.specify/memory/constitution.md` - Condensed principles reference for speckit, it is based on the Full constitutional charter.

If this document conflicts with the constitution, the constitution takes precedence.

## Core Principles for AI Agents

### 1. Human-in-the-Loop (NON-NEGOTIABLE)
- **AI assists; humans decide.** You are an assistant, not an autonomous owner.
- **Never make changes without explicit user instruction.** When in "ask mode" or "plan mode", do not execute code changes.
- **Always explain non-trivial changes** - provide rationale connecting code to specifications.
- **Respect architectural boundaries** - never modify Olympus core code (backend/, frontend/, mod/).

### 2. Documentation in Code (NON-NEGOTIABLE)
- **All documentation MUST be in code** - comprehensive JSDoc/TSDoc for all public APIs, classes, functions, and types.
- **No separate markdown documentation files** except minimal README for setup.
- **Inline comments explain "why"** for non-obvious decisions, not just "what".
- **Type definitions must include field descriptions** and usage examples where helpful.

### 3. Whitelisted Implementation Areas
You MAY create new code or modify existing code in:
- `bfis-service/**` - BFIS sidecar implementation
- `shared-schemas/**` - Shared TypeScript data contracts
- `docs/**` - Documentation and specifications

You MUST NOT modify:
- `backend/**` - Olympus C++/C# backend (read-only reference)
- `frontend/**` - Olympus frontend/server (read-only reference)
- `mod/**` - DCS mod files (read-only reference)
- Any other Olympus core directories

### 4. Architectural Boundaries
- **Olympus runs the world** - it is the single source of truth for mission state.
- **BFIS is the brain in the corner** - external service that observes and commands via HTTP APIs.
- **BFIS never talks directly to DCS** - only through Olympus' public APIs.
- **Never duplicate Olympus functionality** - if BFIS logic starts duplicating Olympus, stop and say: "Let Olympus handle that; BFIS only needs the results."

### 5. Code Quality Standards
- **TypeScript strict mode required** for all new BFIS code.
- **Error handling must be explicit** - avoid silent failures, log errors with context.
- **Code must pass the "six months later" test** - readable by someone who didn't write it.
- **Complexity must be justified** - if code is hard to understand, add comments or refactor.
- **AI-generated code must include JSDoc** explaining rationale and connection to specifications.

### 5.1 Logging & Instrumentation (NON-NEGOTIABLE)
- **Everything must be logged and structured**:
  - Service events, probes, errors, and decision cycles MUST emit structured JSON records.
  - Logs MUST be written to files under the BFIS logs folder (for example `bfis-service/logs/` via configured paths) in addition to stdout/stderr when running in Docker.
- **Use shared logging utilities**:
  - General service logs MUST go through the structured logger (for example `createStructuredLogger`) instead of ad-hoc `console.log` for anything beyond temporary debugging.
  - Decision logs MUST use the NDJSON logger and conform to the BFIS decision log schema.
- **No one-off logging**:
  - Avoid bespoke log formats or ad-hoc strings; all logs should be machine-parsable and consistent with existing patterns.

### 6. Specification-Driven Development
- **Specs first, code second** - significant changes must be described in `docs/integration/bfis/` or the constitution before implementation.
- **Code that diverges from written spec is out of order** and must be reconciled.
- **Shared schemas are contract** - `shared-schemas/index.ts` is the single source of truth for BFIS ⇄ Olympus data shapes.

### 7. Testing Approach (NON-NEGOTIABLE)
- **ALL testing MUST be performed using the Docker container (ABSOLUTELY PROHIBITED to test on host)**:
  - Tests MUST run inside the BFIS Docker container environment, not directly on the host system.
  - This prevents Node.js version mismatches, path resolution issues, and ensures consistent runtime environment.
  - NO exceptions: unit tests, integration tests, manual test scripts - ALL must run in Docker.
  - Test commands MUST be provided as Docker commands, not host npm/node commands.
- **Test critical paths** - integration points, decision logic, data transformations.
- **Unit tests for complex algorithms** and business logic.
- **Integration tests for contract compliance** - BFIS ⇄ Olympus shared schemas, command mapping.
- **No coverage requirements**, but tests must be meaningful and maintainable.
- **Test file location (ABSOLUTELY PROHIBITED):** Tests MUST be saved to the correct test folder for the component you are working on. It is **ABSOLUTELY PROHIBITED** to save tests to the repository root. Tests must be co-located with the code they test (e.g., `bfis-service/src/snapshot/__tests__/` for snapshot tests).

### 7.1 Testing Pattern (Wireframe Style)
- **Wireframe test suites, not one-off tests**:
  - When adding tests, follow a consistent directory and naming pattern (for example `__tests__/snapshot-reader.test.ts` mirroring `snapshot-reader.ts`).
  - Avoid single, ad-hoc test scripts; build test scaffolding that can be expanded as BFIS grows.
- **Instrumented tests**:
  - Tests SHOULD assert on structured logs or key events where it makes sense, to ensure instrumentation stays intact and meaningful.

## Common Workflows

### When Creating New BFIS Code
1. Check if functionality belongs in Olympus (if yes, stop - you cannot modify Olympus).
2. Verify the change aligns with the constitution and BFIS integration docs.
3. Create code with comprehensive JSDoc comments.
4. Use types from `shared-schemas/index.ts` - do not redefine overlapping types.
5. Follow the established module pattern: focused, single-responsibility modules.

### When Reviewing Code
1. Verify compliance with constitution (especially Article IX - Code Quality Standards).
2. Check that documentation is in code (JSDoc/TSDoc), not separate markdown files.
3. Ensure architectural boundaries are respected (no Olympus core modifications).
4. Validate that shared schemas are used correctly (no duplicate type definitions).

### When Working with Placeholders
- **Placeholder code must be clearly marked** with TODO comments.
- **Include implementation notes** explaining what needs to be done.
- **Do not implement code** unless explicitly instructed - create placeholders with explanations.

## Error Handling

If you encounter:
- **Conflicting instructions** → Follow the constitution over this document. If the constitution is unclear, stop and ask the human.
- **Unclear requirements** → Ask the user for clarification rather than guessing.
- **Architectural violations** → Stop and explain why the change violates boundaries.
- **Missing context** → Read the relevant specification documents first.

## References

- **Constitution:** `docs/CONSTITUTION.md`
- **BFIS Service Definition:** `docs/integration/bfis/BFIS-service-definition.md`
- **BFIS Integration Strategy:** `docs/integration/bfis/bfis_olympus_integration_strategy.md`
- **Shared Schemas:** `shared-schemas/index.ts`

## Remember

> "Let Olympus handle that; BFIS only needs the results."

When in doubt, refer to the constitution. When the constitution is unclear, stop and ask the human.
