# Feature Specification: Multi-Agent LLM Architecture for BFIS

**Feature Branch**: `004-bfis-llm-architecture`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "@docs/architecture/spec-004.md @bfis-service/src/agents/types.ts"

## Clarifications

### Session 2025-01-27

- Q: What should rules-based fallback decision-making produce when intelligent decision-making fails? → A: Conservative defensive actions only (protect key assets, no aggressive moves)
- Q: Can BFIS run multiple decision cycles simultaneously, or must cycles be sequential? → A: Sequential cycles only (one cycle completes before next starts)
- Q: How should BFIS handle command execution failures? → A: Retry failed commands once (initial attempt + one retry = 2 total attempts), if second attempt fails log error and continue to next cycle
- Q: Should MVP execute commands against Olympus or only log them? → A: Configurable (can switch between logging and execution)
- Q: What should BFIS do if the LLM service is unavailable when the service starts? → A: Start in rules-only mode if LLM unavailable (graceful degradation)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - BFIS Observes and Summarizes Battlefield State (Priority: P1)

BFIS must be able to observe the current battlefield state from Olympus and generate high-level tactical summaries that describe unit counts, key positions, and threats. This intelligence gathering capability enables BFIS to understand what's happening on the battlefield without processing every detail.

**Why this priority**: This is the foundational capability that enables all decision-making. Without the ability to observe and summarize battlefield state, BFIS cannot make informed decisions. This story delivers immediate value by providing human-readable battlefield intelligence even if no actions are taken.

**Independent Test**: Can be fully tested by verifying that BFIS successfully observes battlefield state from Olympus and produces tactical summaries containing unit counts by coalition, key positions (airbases, bullseyes, clusters), and threat assessments. Delivers the capability for BFIS to understand and communicate battlefield state in human terms.

**Acceptance Scenarios**:

1. **Given** BFIS is running and Olympus has an active mission, **When** BFIS observes the battlefield, **Then** it produces a tactical summary with unit counts by coalition (BLUE, RED, NEUTRAL, UNKNOWN)
2. **Given** BFIS observes a battlefield with airbases and bullseyes, **When** it generates a tactical summary, **Then** it includes key positions with their locations and coalition affiliations
3. **Given** BFIS observes a battlefield with units from multiple coalitions, **When** it generates a tactical summary, **Then** it includes threat assessments with severity levels (low, medium, high) for each coalition
4. **Given** BFIS encounters an error while observing battlefield state, **When** it processes the error, **Then** it logs the error with sufficient context and continues operation (recoverable error) or gracefully degrades (non-recoverable error)

---

### User Story 2 - BFIS Detects Changes Between Battlefield Observations (Priority: P1)

BFIS must be able to detect meaningful changes between consecutive battlefield observations, identifying new units, destroyed units, units that moved significantly, and changes in hostility status. This change detection enables BFIS to focus on what's new or different rather than reprocessing the entire battlefield state.

**Why this priority**: Change detection is essential for efficient decision-making. It allows BFIS to understand what changed since the last observation, which is critical for responding to dynamic battlefield conditions. This story can be tested independently by comparing two snapshots and verifying change detection accuracy.

**Independent Test**: Can be fully tested by providing two consecutive battlefield snapshots and verifying that BFIS correctly identifies new units, destroyed units, units that moved beyond a threshold distance, and changes in hostility status. Delivers the capability for BFIS to track battlefield evolution over time.

**Acceptance Scenarios**:

1. **Given** BFIS has observed a previous battlefield state, **When** it observes a new state with additional units, **Then** it correctly identifies the new units with their coalition and category
2. **Given** BFIS has observed a previous battlefield state, **When** it observes a new state where units have been destroyed, **Then** it correctly identifies the destroyed units
3. **Given** BFIS has observed a previous battlefield state, **When** it observes a new state where units have moved more than the configured threshold, **Then** it correctly identifies the moved units with their old and new positions
4. **Given** BFIS has observed a previous battlefield state, **When** it observes a new state where hostilities have started or stopped, **Then** it correctly detects the hostility status change
5. **Given** BFIS encounters a session reset (mission restart), **When** it detects the session hash change, **Then** it clears previous state and treats the new observation as the first in a new session

---

### User Story 3 - BFIS Makes Decisions Based on Battlefield Intelligence (Priority: P1)

BFIS must be able to make tactical decisions based on battlefield intelligence summaries. Given a tactical summary of the current state and detected changes, BFIS produces a decision containing one or more high-level actions (spawn, move, attack, etc.) with reasoning for why those actions were chosen.

**Why this priority**: Decision-making is the core value proposition of BFIS. This story enables BFIS to autonomously determine what actions to take based on battlefield observations. It can be tested independently by providing tactical summaries and verifying that BFIS produces valid decisions with appropriate actions.

**Independent Test**: Can be fully tested by providing tactical summaries and mission context, then verifying that BFIS produces decisions containing valid actions with reasoning. Delivers the capability for BFIS to autonomously determine what to do based on battlefield intelligence.

**Acceptance Scenarios**:

1. **Given** BFIS receives a tactical summary showing an imbalance between coalitions, **When** it makes a decision, **Then** it produces actions that address the imbalance (e.g., spawn units for the weaker side)
2. **Given** BFIS receives a tactical summary showing threats to key positions, **When** it makes a decision, **Then** it produces actions that address the threats (e.g., spawn defensive units or redirect existing units)
3. **Given** BFIS receives a tactical summary and mission context indicating hostilities have not started, **When** it makes a decision, **Then** it does not produce aggressive actions (e.g., no attacks) until hostilities begin
4. **Given** BFIS encounters an error while making a decision, **When** it processes the error, **Then** it falls back to rules-based decision-making producing conservative defensive actions (protect key assets, no aggressive moves) and still produces a valid decision
5. **Given** BFIS makes a decision, **When** it produces the decision, **Then** it includes reasoning notes explaining why those actions were chosen

---

### User Story 4 - BFIS Translates Decisions into Executable Commands (Priority: P1)

BFIS must be able to translate high-level decisions into concrete commands that can be executed by Olympus. Given a decision containing actions (spawn, move, attack, etc.), BFIS maps each action to the appropriate Olympus command format and prepares them for execution.

**Why this priority**: Command translation is essential for BFIS to actually affect the battlefield. Without this capability, decisions remain theoretical. This story can be tested independently by providing decisions and verifying correct command mapping.

**Independent Test**: Can be fully tested by providing decisions with various action types and verifying that BFIS correctly maps each action to the appropriate Olympus command format. Delivers the capability for BFIS to execute its decisions in the game world.

**Acceptance Scenarios**:

1. **Given** BFIS receives a decision containing a SPAWN action, **When** it translates the decision, **Then** it maps the action to the appropriate Olympus spawn command (e.g., spawnAircrafts, spawnHelicopters) with correct parameters, and either logs the command (if in logging mode) or executes it (if in execution mode)
2. **Given** BFIS receives a decision containing a MOVE action, **When** it translates the decision, **Then** it maps the action to the appropriate Olympus movement command (e.g., setPath, landAt) with correct parameters
3. **Given** BFIS receives a decision containing an ATTACK action, **When** it translates the decision, **Then** it maps the action to the appropriate Olympus attack command (e.g., attackUnit, bombPoint) with correct parameters
4. **Given** BFIS receives a decision with an unknown action type, **When** it translates the decision, **Then** it logs a warning for the unknown action and continues processing remaining actions
5. **Given** BFIS receives a decision with invalid command parameters, **When** it validates the command, **Then** it logs an error and skips the invalid command while continuing with valid commands

---

### User Story 5 - BFIS Orchestrates Multi-Agent Decision Cycles (Priority: P2)

BFIS must coordinate the three specialized agents (Intel, Commander, Writer) to complete full decision cycles. The orchestrator manages the flow from battlefield observation through decision-making to command translation, ensuring each agent receives the correct inputs and their outputs flow to the next agent in sequence.

**Why this priority**: While the individual agents can be tested independently, the orchestrator enables the complete end-to-end workflow. This story ensures that the three agents work together seamlessly to produce decisions and commands from battlefield observations. It can be tested independently by running full cycles and verifying correct agent coordination.

**Independent Test**: Can be fully tested by running a complete decision cycle and verifying that Intel agent output flows to Commander, Commander output flows to Writer, and the final commands are produced. Delivers the capability for BFIS to autonomously complete full decision cycles without human intervention.

**Acceptance Scenarios**:

1. **Given** BFIS starts a decision cycle, **When** the orchestrator runs the cycle, **Then** it coordinates Intel agent to observe and summarize, Commander agent to decide, and Writer agent to translate commands in sequence, and no new cycle starts until the current cycle completes
2. **Given** BFIS encounters an error in the Intel agent, **When** the orchestrator processes the error, **Then** it allows the cycle to continue with degraded intelligence (if recoverable) or aborts the cycle (if fatal)
3. **Given** BFIS encounters an error in the Commander agent, **When** the orchestrator processes the error, **Then** it allows the cycle to continue with fallback decision-making (if recoverable) or aborts the cycle (if fatal)
4. **Given** BFIS encounters an error in the Writer agent, **When** the orchestrator processes the error, **Then** it allows partial command execution (if recoverable) or aborts the cycle (if fatal)
5. **Given** BFIS completes a decision cycle, **When** the orchestrator finishes, **Then** it logs the cycle completion with timing information and any errors encountered

---

### Edge Cases

- What happens when BFIS observes a battlefield with zero units? (System should produce a valid summary indicating empty battlefield)
- What happens when BFIS observes a battlefield with more than 1000 units? (System should filter or aggregate units to focus on relevant subsets)
- How does BFIS handle rapid session hash changes (mission restarts)? (System should detect session changes and reset all cached state immediately)
- What happens when BFIS makes a decision but all command translations fail? (System should log errors and continue to next cycle, not retry indefinitely)
- What happens when a command execution fails? (System should retry once, and if the retry also fails, log error and continue to next cycle)
- How does BFIS handle network timeouts when observing battlefield state? (System should retry with exponential backoff, then proceed with degraded state if retries fail)
- What happens when BFIS receives conflicting actions in a single decision? (System should validate and reject conflicting actions, logging warnings)
- How does BFIS handle missing or invalid mission context? (System should use default values or skip decision-making for that cycle)
- What happens when BFIS detects changes but the previous snapshot is unavailable? (System should treat current snapshot as baseline and skip change detection for that cycle)
- What happens when a new decision cycle is requested while a previous cycle is still running? (System should queue the new cycle and start it only after the current cycle completes)
- What happens when BFIS is configured for logging-only mode? (System should translate and log all commands but not execute them against Olympus)
- What happens when BFIS starts and the LLM service is unavailable? (System should start in rules-only mode, log a warning, and continue operation using rules-based decision-making)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST observe current battlefield state from Olympus and produce tactical summaries containing unit counts by coalition, unit counts by category, key positions, and threat assessments
- **FR-002**: System MUST detect changes between consecutive battlefield observations, identifying new units, destroyed units, units that moved significantly, and hostility status changes
- **FR-003**: System MUST produce tactical decisions containing one or more high-level actions (spawn, move, attack, etc.) based on battlefield intelligence summaries
- **FR-004**: System MUST include reasoning notes with each decision explaining why those actions were chosen
- **FR-005**: System MUST translate high-level decisions into concrete Olympus command formats (spawnAircrafts, setPath, attackUnit, etc.)
- **FR-018**: System MUST support configurable command execution mode (logging-only or actual execution against Olympus), allowing safe testing before live execution
- **FR-006**: System MUST validate command parameters before execution and skip invalid commands while continuing with valid ones
- **FR-017**: System MUST retry failed command executions once (initial attempt + one retry = 2 total attempts), and if the retry also fails, log the error and continue to the next cycle
- **FR-007**: System MUST coordinate three specialized agents (Intel, Commander, Writer) to complete full decision cycles from observation to command translation
- **FR-016**: System MUST process decision cycles sequentially (one cycle completes before the next cycle starts)
- **FR-008**: System MUST handle errors from individual agents gracefully, allowing cycles to continue with degraded functionality when errors are recoverable
- **FR-009**: System MUST fall back to rules-based decision-making when intelligent decision-making fails, producing conservative defensive actions only (protect key assets, no aggressive moves)
- **FR-019**: System MUST start in rules-only mode if LLM service is unavailable at startup, enabling graceful degradation and continued operation
- **FR-010**: System MUST respect hostility status and not produce aggressive actions (attacks) before hostilities begin
- **FR-011**: System MUST detect session hash changes and reset all cached state when mission restarts
- **FR-012**: System MUST log all decision cycles with timing information, agent outputs, and any errors encountered
- **FR-013**: System MUST complete decision cycles within the configured time limit (default 30 seconds)
- **FR-014**: System MUST limit the number of actions per decision to prevent overwhelming the command system
- **FR-015**: System MUST cache previous battlefield observations for change detection, clearing cache on session changes

### Key Entities *(include if feature involves data)*

- **Tactical Summary**: High-level overview of battlefield state containing unit counts by coalition and category, key positions (airbases, bullseyes, clusters), threat assessments with severity levels, and snapshot metadata (timestamp, snapshot ID)
- **Snapshot Delta**: Change detection results comparing two consecutive observations, containing lists of new units, destroyed units, moved units, hostility status changes, and timestamps for both snapshots
- **Mission Context**: Metadata about the current mission including mission ID, server ID, session hash, current time, and hostility status
- **Decision**: High-level tactical decision containing a list of actions (spawn, move, attack, etc.), reasoning notes explaining the decision, decision ID, and timestamp
- **Command Result**: Execution status for a translated command, containing command hash, lifecycle status (PENDING, SENT, CONFIRMED, FAILED), and optional error message
- **Agent State**: Complete state of a decision cycle, containing current and previous snapshots, agent outputs (Intel, Commander, Writer), decisions, command results, error state, cycle metadata (ID, start time, end time), and optional user approval flag

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: BFIS completes full decision cycles (from battlefield observation to command translation) in under 5 seconds for 95% of cycles
- **SC-002**: BFIS correctly identifies changes between consecutive battlefield observations with at least 95% accuracy (new units, destroyed units, moved units, hostility changes)
- **SC-003**: BFIS produces valid decisions (containing at least one action with reasoning) for at least 90% of decision cycles when battlefield state is available
- **SC-004**: BFIS successfully translates at least 95% of valid actions into correct Olympus command formats
- **SC-005**: BFIS recovers from recoverable errors (Intel snapshot failures, Commander decision failures) and continues operation in at least 80% of error cases without requiring manual intervention
- **SC-006**: BFIS falls back to rules-based decision-making within 2 seconds when intelligent decision-making fails, producing conservative defensive actions (protect key assets, no aggressive moves) in at least 90% of fallback cases
- **SC-007**: BFIS detects session hash changes and resets cached state within 1 second of detecting the change
- **SC-008**: BFIS logs all decision cycles with complete information (timing, agent outputs, errors) for 100% of cycles, enabling full traceability and debugging
- **SC-009**: BFIS respects hostility status constraints, producing zero aggressive actions (attacks) before hostilities begin in 100% of cases
- **SC-010**: BFIS limits decision complexity, producing decisions with no more than the configured maximum actions per decision (default 10) in 100% of cases

## Assumptions

- Battlefield observations are available from Olympus at regular intervals (polling-based, not event-driven)
- Olympus command API is available and responsive for command execution
- LLM services (Ollama, LLMstudio, or cloud providers) are available and configured when intelligent decision-making is enabled
- Mission context (mission ID, server ID, session hash) remains stable within a single mission session
- Hostility status is provided by Olympus and BFIS does not compute it independently
- Command execution is asynchronous and tracked via command hashes (not part of this feature)
- Previous battlefield observations can be cached in memory for change detection (no persistent storage required for MVP)
- Error rates for individual agents are low enough that fallback mechanisms are rarely needed but must be available
- Battlefield state changes occur at a rate that allows decision cycles to complete before the next observation is needed

