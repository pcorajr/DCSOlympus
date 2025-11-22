# Quick Start: Multi-Agent LLM Architecture for BFIS

**Date**: 2025-01-27  
**Feature**: Multi-Agent LLM Architecture for BFIS  
**Phase**: Phase 1 - Design & Contracts

## Overview

This guide provides a quick start for implementing and testing the multi-agent LLM architecture for BFIS. The architecture consists of three specialized agents (Intel, Commander, Writer) orchestrated by a LangGraph-based state machine.

## Prerequisites

- Node.js 18+ (TypeScript 5.8.2)
- Docker (for testing, per constitution requirement)
- LLM service (Ollama or LLMstudio) for intelligent decision-making
- Olympus service running and accessible
- BFIS credentials configured in `/home/dcs/.creds/olympus_env.txt`

## Installation

### 1. Install Dependencies

```bash
cd bfis-service
npm install @langchain/langgraph @langchain/core
npm install @turf/turf lodash
npm install --save-dev @types/lodash
```

### 2. Configure LLM Provider

Set environment variables for LLM provider:

```bash
# For Ollama (local)
export BFIS_LLM_PROVIDER=ollama
export BFIS_LLM_BASE_URL=http://localhost:11434
export BFIS_LLM_MODEL=llama3

# For LLMstudio (local)
export BFIS_LLM_PROVIDER=llmstudio
export BFIS_LLM_BASE_URL=http://localhost:1234
export BFIS_LLM_MODEL=llama3

# For rules-only mode (no LLM)
export BFIS_LLM_PROVIDER=none
```

### 3. Configure Command Execution Mode

```bash
# Logging-only mode (safe for testing)
export BFIS_COMMAND_EXECUTION_MODE=log

# Live execution mode (production)
export BFIS_COMMAND_EXECUTION_MODE=execute
```

## Implementation Steps

### Phase 1: Intel Agent

1. **Create snapshot tools** (`bfis-service/src/agents/tools/snapshot-tools.ts`):
   - `get_current_snapshot()` - Wraps `SnapshotReader.readContextOnce()`
   - `get_snapshot_summary(snapshot)` - Generates tactical summary
   - `detect_changes(current, previous)` - Compares snapshots

2. **Implement Intel agent** (`bfis-service/src/agents/intel-agent.ts`):
   - Process snapshot and generate `TacticalSummary`
   - Detect changes between snapshots (if previous available)
   - Return `IntelAgentOutput`

3. **Test Intel agent**:
   ```bash
   docker run --rm --network host \
     -v /home/dcs/.creds:/home/dcs/.creds:ro \
     bfis-service \
     node --test build/src/agents/__tests__/intel-agent.test.js
   ```

### Phase 2: Commander Agent

1. **Implement Commander agent** (`bfis-service/src/agents/commander-agent.ts`):
   - Take `CommanderAgentInput` (Intel output + mission context)
   - Use LLM to generate `BfisDecision` with actions and reasoning
   - Fall back to rules-based decision-making on LLM failure
   - Rules-based fallback: Conservative defensive actions only

2. **Implement rules-based fallback** (`bfis-service/src/agents/rules-fallback.ts`):
   - Protect BLUE key assets (airbases)
   - Spawn defensive units near threats
   - Never attack before hostilities begin

3. **Test Commander agent**:
   ```bash
   docker run --rm --network host \
     -v /home/dcs/.creds:/home/dcs/.creds:ro \
     bfis-service \
     node --test build/src/agents/__tests__/commander-agent.test.js
   ```

### Phase 3: Writer Agent

1. **Implement Writer agent** (`bfis-service/src/agents/writer-agent.ts`):
   - Take `WriterAgentInput` (decision + available commands)
   - Map `BfisAction` types to Olympus command formats
   - Validate command parameters
   - Execute commands (if execution mode) or log them (if logging mode)
   - Retry failed commands once (2 total attempts)

2. **Test Writer agent**:
   ```bash
   docker run --rm --network host \
     -v /home/dcs/.creds:/home/dcs/.creds:ro \
     bfis-service \
     node --test build/src/agents/__tests__/writer-agent.test.js
   ```

### Phase 4: Orchestrator

1. **Implement orchestrator** (`bfis-service/src/agents/orchestrator.ts`):
   - Define LangGraph state machine with nodes and edges
   - Implement error checking node
   - Coordinate Intel → Commander → Writer flow
   - Handle sequential cycle processing

2. **Integrate with polling loop** (`bfis-service/src/runtime/polling-loop.ts`):
   - After snapshot fetch, build `AgentState`
   - Call orchestrator `runCycle(initialState)`
   - Log cycle completion

3. **Test orchestrator**:
   ```bash
   docker run --rm --network host \
     -v /home/dcs/.creds:/home/dcs/.creds:ro \
     bfis-service \
     node --test build/src/agents/__tests__/orchestrator.test.js
   ```

## Testing

### Unit Tests

All tests MUST run in Docker container (per constitution):

```bash
# Build Docker image
docker build -f bfis-service/Dockerfile -t bfis-service .

# Run all agent tests
docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  node --test build/src/agents/__tests__/**/*.test.js
```

### Integration Tests

Test full orchestrator cycle:

```bash
docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  node --test build/src/agents/__tests__/orchestrator.test.js
```

### Manual Testing

Start BFIS service and observe decision cycles:

```bash
# Start BFIS service
docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  npm start

# Watch logs
docker logs -f <container-id>
```

## Configuration

### Agent-Specific Settings

Extend `BfisConfig` in `bfis-service/src/config/config.ts`:

```typescript
export interface AgentConfig {
  intel: {
    pollingIntervalMs: number;        // Default: 2000
    enableChangeDetection: boolean;    // Default: true
    positionChangeThresholdMeters: number; // Default: 1000
    maxTokens: number;                 // Default: 2000
    temperature: number;               // Default: 0.3
  };
  commander: {
    maxTokens: number;                 // Default: 4000
    temperature: number;               // Default: 0.7
    enableRulesFallback: boolean;      // Default: true
    maxActionsPerDecision: number;     // Default: 10
  };
  writer: {
    maxTokens: number;                 // Default: 2000
    temperature: number;               // Default: 0.2
    enableCommandValidation: boolean;  // Default: true
  };
  orchestrator: {
    enableCheckpointing: boolean;      // Default: false
    maxCycles: number;                 // Default: 10
    cycleTimeoutMs: number;            // Default: 30000
  };
}
```

## Logging

All agent logs written to `bfis-service/logs/`:

- **Structured logs**: `bfis-service.log` (JSON format)
- **Decision logs**: `decisions.ndjson` (NDJSON format, one line per cycle)
- **Event names**: `bfis-{agent}-{event}` (e.g., `bfis-intel-summary-generated`)

## Troubleshooting

### LLM Service Unavailable

If LLM service is unavailable at startup:
- BFIS starts in rules-only mode (per FR-019)
- Logs warning: `bfis-commander-llm-unavailable`
- Continues operation using rules-based decision-making

### Command Execution Failures

If command execution fails:
- Retry once (2 total attempts)
- If retry fails: Log error, mark as FAILED, continue to next cycle
- Check logs for `bfis-writer-command-error` events

### Cycle Timeout

If cycle exceeds 30 seconds:
- Orchestrator aborts cycle
- Logs error: `bfis-orchestrator-cycle-timeout`
- Returns partial results if available

## Next Steps

1. Implement Intel agent (Phase 1)
2. Implement Commander agent with rules-based fallback (Phase 2)
3. Implement Writer agent with command mapping (Phase 3)
4. Implement orchestrator and integrate with polling loop (Phase 4)
5. Test full end-to-end cycle
6. Switch to execution mode when ready

## References

- **Specification**: [spec.md](./spec.md)
- **Architecture**: `docs/architecture/spec-004.md`
- **Types**: `bfis-service/src/agents/types.ts`
- **Command Mapping**: `docs/integration/bfis/bfis_action_command_mapping.md`
- **Constitution**: `docs/CONSTITUTION.md`

