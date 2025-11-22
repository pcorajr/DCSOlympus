# Multi-Agent LLM Architecture for BFIS

## Overview

This document describes a multi-agent LLM architecture for BFIS consisting of three specialized agents:

- **Commander LLM**: Orchestrates the other two agents, makes final decisions
- **Writer LLM**: Translates decisions into concrete commands (maps to BFIS actions)
- **Intel LLM**: Monitors battlefield state, provides structured updates from decoder snapshots

This is a clever MVP approach that aligns well with BFIS's existing component structure.

## How This Maps to BFIS

The BFIS architecture already has separation of concerns that matches this vision:

- **Intel Agent** = Snapshot Summarizer + Change Detector
  - Consumes `BfisContextSnapshot` from decoders
  - Generates tactical summaries (unit counts, positions, threats) (see `BFIS-Architecture.md:18-21`)
  - Detects changes between snapshots

- **Commander Agent** = Decider
  - Takes Intel's summaries and determines goals (see `decider.ts:16-19`)
  - Decides what actions to take

- **Writer Agent** = Command Adapter
  - Translates `BfisDecision` actions into Olympus commands (see `BFIS-service-definition.md:23`)
  - Maps action types (SPAWN, MOVE, ATTACK) to concrete API calls (see `bfis_olympus_integration_strategy.md:331-338`)

## Multi-Agent Framework Options

For orchestrating three LLMs talking to each other, consider the following frameworks:

### LangGraph (from LangChain)

**Why it fits:**

- Built specifically for multi-agent workflows with state management
- Agents can pass messages/context between each other
- Supports tool calling (Intel agent can call decoder snapshot tools)
- Handles conversation loops and decision cycles
- TypeScript support via LangChain.js (see `llm-client.ts:0-9`)

**Example flow:**

```
Intel Agent (with snapshot tools) → Commander Agent → Writer Agent → Execute  
         ↑                                  ↓                           ↓  
         └──────────────── feedback loop ───────────────────────────────┘  
```

### AutoGen (Microsoft)

**Why it fits:**

- Designed for multi-agent conversations
- Supports tool/function calling for Intel agent
- Agents can critique each other's outputs
- Has TypeScript bindings

### CrewAI

**Why it fits:**

- Role-based agent system (Commander, Writer, Intel roles)
- Built-in task delegation
- Supports tools and memory
- Python-first but has Node.js integrations

## Intel Agent Tool Design

The Intel agent needs tools to interact with decoders. Here's how:

### Tool 1: `get_current_snapshot`

- Calls `SnapshotReader.readContextOnce()`
- Returns structured `BfisContextSnapshot`

### Tool 2: `get_snapshot_summary`

- Uses Lodash to group/count units by coalition
- Uses Turf.js for spatial analysis (distances, clustering)
- Returns tactical summary object

### Tool 3: `detect_changes`

- Compares current vs previous snapshot
- Returns delta (new units, destroyed units, position changes)

## Streaming Data to LLMs

Options for streaming data directly to LLMs:

### Option 1: Polling with Caching (Simplest MVP)

- Intel agent polls `SnapshotReader` every 2-5 seconds (see `spec-001.md:30-37`)
- Caches previous snapshot for change detection
- Only sends updates to Commander when meaningful changes occur

### Option 2: Event-Driven with Message Queue

- Extend `SnapshotReader` to publish snapshots to Redis/RabbitMQ
- Intel agent subscribes to snapshot stream
- Processes snapshots as they arrive

### Option 3: WebSocket Stream (Most Real-Time)

- Add WebSocket endpoint to BFIS service
- Stream `BfisContextSnapshot` objects as JSON
- Intel agent maintains persistent connection

**Recommendation**: Start with Option 1 (polling) for MVP. The existing polling infrastructure is already there, and you can optimize to streaming later.

## MVP Implementation Path

### Phase 1: Build Intel Agent (What you need now)

- Create `bfis-service/src/agents/intel-agent.ts`
- Implement snapshot tools using existing `SnapshotReader`
- Use LangGraph to define Intel agent with tools
- Output structured summaries in JSON format

### Phase 2: Wire Commander + Writer

- Commander agent receives Intel summaries
- Makes decisions using existing Decider logic (see `decider.ts:0-31`)
- Writer agent translates to Olympus commands

### Phase 3: Close the Loop

- Log decisions to NDJSON (see `bfis_olympus_integration_strategy.md:342-344`)
- Execute commands via Command Adapter
- Intel agent observes results in next snapshot

## Notes

This multi-agent approach is more inventive than a single LLM and naturally maps to BFIS's existing architecture. The Intel agent is the critical piece you need to build first - it bridges the decoders to the LLM world using tools. LangGraph is probably your best bet for orchestrating the three agents, as it's designed for exactly this pattern and integrates with the LLM providers BFIS already supports (Ollama, OpenAI) (see `config.ts:68-79`). The existing `BfisContextSnapshot` structure is already perfect for the Intel agent's tools - you just need to wrap it in function calls that LangGraph can invoke.
