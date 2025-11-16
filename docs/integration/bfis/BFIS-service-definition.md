# BFIS Service Definition

## What is DCSOlympus?

DCSOlympus is the DCS game control server and UI. It owns the live mission state, talks directly to DCS (DLL/Lua), and exposes HTTP APIs and a web UI so humans or other services can see the battlefield and issue commands. DCSOlympus is the single source of truth for mission state and the only service allowed to talk to DCS.

## What is BFIS?

BFIS is an external intelligence and decision service that sits beside DCSOlympus, watches the battlefield through DCSOlympus' existing APIs, and tells DCSOlympus what to do next. It never talks to DCS directly; instead it pulls snapshots of state from DCSOlympus, runs its own logic or LLM prompts to decide actions (spawn, move, attack, etc.), sends those actions back as normal DCSOlympus commands, and logs each decision cycle in NDJSON for replay and debugging. BFIS operates in two main modes: **Autopilot** (passively watching and making autonomous decisions) and **Copilot** (interpreting player intent and turning natural-language instructions into concrete actions). Where DCSOlympus runs the world, BFIS is the "brain in the corner" that reads state, decides, commands, and records what happened.

## BFIS Responsibilities

At a service level, BFIS has two main modes that share the same core loop:

- **Autopilot** – BFIS passively watches DCSOlympus, decides on actions on its own (using rules and/or LLMs), and issues commands back to DCSOlympus.
- **Copilot** – the player actively talks to BFIS (text or voice), and BFIS uses an LLM to turn that intent into concrete actions and DCSOlympus commands, optionally proposing ideas before executing.

In both modes, BFIS is responsible for:

- **Ingesting state** – polling DCSOlympus for mission state, units, weapons, and logs; turning that into a compact internal snapshot.
- **Understanding intent** – combining game state with either BFIS’s own goals or the player’s natural-language instructions (via LLM) into a clear set of actions.
- **Deciding actions** – choosing or co-designing actions such as spawns, moves, attacks, ROE changes, or scenario-building steps.
- **Issuing commands** – mapping BFIS actions to real DCSOlympus commands and driving the async `commandHash` flow until completion.
- **Explaining itself** – producing short, human-readable rationales so the player can see *why* BFIS suggested or executed something.
- **Logging the session** – writing NDJSON records for every decision/interaction cycle, including what state was seen, what the user asked (at a summarized level), what BFIS decided, and which commands were sent.

Things BFIS explicitly does **not** do:

- It does not become a second world-state authority; DCSOlympus remains the source of truth.
- It does not talk directly to DCS (no DLL, no Lua, no mission file hacking).
- It does not replace the DCSOlympus UI; it complements it as an assistant and automation layer.

## BFIS Inputs and Outputs

From the outside, BFIS is defined by a small set of inputs and outputs.

**Inputs**

- **DCSOlympus state** – binary and JSON endpoints that describe the current mission (units, weapons, mission metadata, airbases, bullseyes, spots, logs, etc.).
- **DCSOlympus command API** – the async HTTP command endpoints BFIS uses to drive actual changes in the mission.
- **Player intent** – text or voice input from the user, delivered via whatever UI or voice stack sits in front of BFIS (a separate console, or a voice push-to-talk bridge).
- **Configuration and limits** – BFIS runtime configuration such as poll intervals, which LLM to use, safe action limits, and which categories of commands are allowed in a given session.

**Outputs**

- **DCSOlympus commands** – concrete REST calls into DCSOlympus that implement BFIS’s decisions or the player’s requested actions (for example spawning a CAP, redirecting a package, adjusting ROE, or setting up a scenario).
- **NDJSON decision logs** – one record per decision/interaction, capturing the snapshot metadata, the player’s high-level request (not full raw prompts), BFIS’s selected actions, and the resulting command hashes and statuses.
- **Human-facing explanations** – short textual or voice summaries that a UI can show to the user (“Spawned 2 F-16s in CAP_EAST and redirected BLUE_SEAD_1 to WP3 based on your request to reinforce the east.”).

For collaborative scenario building, BFIS simply repeats this pattern at a higher level: the player describes the scenario they want, the LLM helps refine it into a plan (waypoints, packages, triggers), and BFIS turns that plan into a series of DCSOlympus commands, logging each step.

## Where is the code?

- BFIS service implementation lives under `bfis-service/` (entrypoint: `bfis-service/src/index.ts`).
- Shared TypeScript schemas for the BFIS ⇄ Olympus contract live in `shared-schemas/index.ts`.

## BFIS Internal Pieces (High Level)

Internally, BFIS stays small and focused. It can be thought of as four main pieces wired around a loop:

- **Snapshot Reader** – polls DCSOlympus endpoints, decodes binary/JSON responses, and produces a normalized `DCSOlympusSnapshot` for the rest of the service.
- **Intent & Dialogue Layer** – manages conversations with the player and models. It accepts natural-language input, keeps lightweight dialogue context, and uses an LLM to interpret “what the user really wants” in terms of BFIS actions or scenario-building steps.
- **Decider** – takes the latest snapshot plus either autonomous goals or interpreted player intent and produces a `BfisDecision` (a list of typed actions with targets and parameters).
- **Command Adapter** – maps each BFIS action to a concrete DCSOlympus command name and parameter payload, sends it via the async command API, and tracks command hashes and statuses.
- **Logger & Telemetry** – writes the NDJSON records, including timing, model info, action lists, and command linkage, so you can replay or analyze sessions later.

The same machinery works whether BFIS is quietly automating background decisions or acting as a chatty, voice-driven copilot; the only difference is where the intent comes from (BFIS itself vs. the player) and how explicit BFIS is about asking for confirmation before it executes commands.
