I understand you want a specification for transforming BFIS decoded battlefield data into actionable narratives that an LLM can use for decision-making.

Based on the conversation, you need a spec that covers:

    Taking BfisContextSnapshot data from the decoders types.ts:21-41
    Transforming it into meaningful narratives/summaries BFIS-Architecture.md:19-22
    Formatting it for LLM consumption BFIS-service-definition.md:61-62
    Getting structured decisions back from the LLM bfis_olympus_integration_strategy.md:330-338

Proposed Spec Structure

Here's what the spec should cover, following the existing BFIS spec pattern (like specs/001-bfis-snapshot-decoders/spec.md and specs/002-context-snapshot/spec.md):
Spec 003: LLM Snapshot View Builder

1. Purpose & Scope

    Transform BfisContextSnapshot into LLM-consumable formats types.ts:14-17
    Generate tactical summaries and narratives from raw battlefield data BFIS-Architecture.md:20-21
    Support both structured JSON and natural language prompt formats
    Enable LLM to return typed BfisDecision objects bfis_olympus_integration_strategy.md:271-279

2. High-Level Behavior

    Snapshot Summarization: Convert raw snapshot data into tactical summaries (unit counts by coalition, positions, threats) BFIS-Architecture.md:19-20
    Change Detection: Compare with previous snapshots to identify deltas ("2 new Red groups appeared") BFIS-Architecture.md:22
    Prompt Formatting: Structure data as LLM prompts with context and tactical situation BFIS-service-definition.md:61-62
    Response Parsing: Parse LLM responses back into typed BfisAction arrays bfis_olympus_integration_strategy.md:265-269

3. Inputs

    BfisContextSnapshot from SnapshotReader.readContextOnce() types.ts:21-41
    Previous snapshot(s) for change detection
    LLM configuration (model, temperature, max tokens) llm-client.ts:4-8

4. Outputs

    LLM View Object: Structured representation with tactical summaries
    Formatted Prompts: Natural language or structured JSON for LLM consumption
    Parsed Decisions: BfisDecision objects with typed actions bfis_olympus_integration_strategy.md:271-279

5. Key Components

5.1 Snapshot Summarizer (bfis-service/src/llm-view/snapshot-summarizer.ts)

    Generate tactical summaries from BfisContextSnapshot
    Calculate unit counts by coalition, type, and position
    Identify tactical gaps and concentrations BFIS-Architecture.md:21

5.2 Change Detector (bfis-service/src/llm-view/change-detector.ts)

    Compare current vs previous snapshots
    Detect new/destroyed units, position changes, status changes BFIS-Architecture.md:22

5.3 Prompt Builder (bfis-service/src/llm-view/prompt-builder.ts)

    Format summaries and context into LLM prompts
    Support multiple prompt templates (Autopilot vs Copilot modes) BFIS-service-definition.md:15-16
    Include mission context, tactical situation, and available actions

5.4 Decision Parser (bfis-service/src/llm-view/decision-parser.ts)

    Parse LLM responses into BfisDecision objects
    Validate action types, targets, and parameters bfis_olympus_integration_strategy.md:265-269
    Handle malformed responses gracefully

6. Integration Points

    Consumed by Decider component decider.ts:16-19
    Uses LLMClient for model communication llm-client.ts:1-11
    Feeds into NDJSON decision logs bfis_olympus_integration_strategy.md:302-353

7. Success Criteria

    Summaries accurately reflect snapshot state (unit counts, positions)
    Change detection identifies all meaningful deltas
    LLM prompts are under token limits and well-structured
    Decision parsing handles 95%+ of valid LLM responses
    End-to-end latency < 5 seconds (snapshot → LLM → decision)

Notes
This spec would build on the existing architecture where BfisContextSnapshot is already normalized and structured spec-002.md:120-147 . The Decider component is already designed to consume this decider.ts:1-32 , and the NDJSON logging format already anticipates this flow bfis_olympus_integration_strategy.md:320-327 . The spec should follow the constitution's requirement for specs-first development constitution.md:59-61 and maintain the sidecar pattern where BFIS only talks to Olympus via existing APIs bfis_olympus_integration_strategy.md:86-92 .