# GitHub Spec Kit: Comprehensive Guide and Best Practices

GitHub **Spec Kit** is an open source toolkit for *Specification-Driven Development (SDD)* – a methodology that makes structured specs the centerpiece of the software lifecycle. Instead of jumping straight into coding, SDD has you articulate **what** to build and **why**, then leverages AI to implement the **how**. In Spec Kit, detailed Markdown-based specifications, plans, and tasks drive code generation, flipping the script so that *specs become “executable” and directly generate working implementations*. This guide covers Spec Kit’s core functionality, workflows for both new and ongoing (“brownfield”) projects, best practices (do’s & don’ts), command sequences, advanced tips, and guidance toward CI/CD integration.

---

## Overview: Core Philosophy of Spec-Driven Development

**Spec-Driven Development (SDD)** treats the specification as a living, version-controlled artifact that guides and even *produces* the code, rather than a throwaway planning document. The philosophy is that by nailing down **explicit requirements and decisions up front**, you can harness AI coding agents to generate more deterministic, high-quality software, avoiding the randomness of “vibe coding” and continual rewrites. Key principles include:

- **Intent First, Implementation Second:** Focus on *what the software should do* (user stories, acceptance criteria, etc.) and *why it matters*, **before** deciding on tech stack or writing code. This ensures the AI works toward well-defined outcomes rather than making assumptions.
- **Multi-Phase Workflow:** Break development into clear phases – specification, planning, task breakdown, and implementation – with AI assisting at each step. Each phase is reviewed and refined by humans before moving on, acting as a “checkpoint” to catch misalignment early.
- **Constitutional Guardrails:** Define non-negotiable principles (architecture guidelines, quality standards, team conventions) in a *project Constitution* so that all AI-generated plans and code honor them. This embeds organizational or project-specific standards from the start.
- **Artifacts as Source of Truth:** The spec, plan, and tasks are **first-class artifacts** in your repository – living documents that evolve with the project. They serve as documentation and a map for the AI. Code becomes the “compiled” output of these specs, meaning if specs change, code can be regenerated or refactored accordingly.
- **AI as Implementer, Human as Architect:** Spec Kit shifts the developer’s role from writing boilerplate to *defining requirements and reviewing outputs*. The developer provides clear prompts and decisions (like an architect), and the AI acts like an eager junior engineer implementing those instructions. Human insight is crucial – you guide the AI and validate every artifact.
- **Iterative Refinement:** Rather than one-shot generation, Spec Kit relies on iterative refinement. The AI first produces a spec, then *clarifies it*, then a plan, etc., with opportunities for Q&A and adjustment at each step. This stepwise approach yields more reliable results than attempting everything in one prompt.
- **Technology-Agnostic Process:** The spec-driven approach is not tied to a specific language or framework – it’s about *process*. Spec Kit supports many AI coding agents and multiple tech stacks. In practice, you could even generate *alternative implementations* (e.g., one in Rust and one in Go) from the same spec by varying the plan inputs.

Spec Kit is a collection of **prompt templates and a CLI** that integrates with your AI tool of choice. The CLI scaffolds a project with all necessary templates and scripts, and the prompts (invoked as “slash commands”) orchestrate the AI agent through the SDD workflow. Spec Kit provides the *structure* and *content* for prompts, while your AI agent provides the brains.

---

## Project Setup and Structure

Before diving into commands, initialize Spec Kit in your project. Installation can be done persistently (via the `uv` tool) or as a one-off runner; either way you run `specify init` to set up the project.

```bash
# Persistent install (via Astral uv tool)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Quick one-time usage (without installing globally)
uvx --from git+https://github.com/github/spec-kit.git specify init my-project
```

The `init` command creates a project folder (or uses the current directory with `--here`) containing:

- \`\`\*\* (or agent-specific folder):\*\* AI **prompt definitions** for your chosen agent (e.g., `specify.prompt.md`, `plan.prompt.md`, etc.).
- \`\`**:** Core templates and metadata: starter `constitution.md`, templates for spec/plan/tasks, and helper scripts (POSIX/PowerShell) for running steps in the right context.

Open your project in an AI-enabled IDE (e.g., VS Code with Copilot Chat) or an AI CLI. Spec Kit’s slash commands become available in that context. Generated artifacts (specs, plans, tasks) are saved as Markdown (often under `specs/`) for review and iteration.

> **Note:** Spec Kit expects a Git repository and uses Git branches to isolate features. If not in a Git repo, it can initialize one. You can also set `SPECIFY_FEATURE="your-feature-name"` to define a feature context.

---

## Spec Kit Workflow: Commands and Phases

**Typical sequence:** **Constitution → Specify → (Clarify) → Plan → (Checklist) → Tasks → (Analyze) → Implement**.

### 1) `/speckit.constitution` – Establish Principles and Constraints

Creates or updates the **Constitution**: the project’s **rules of the game**. These high-level, non‑negotiable constraints guide all later work. Include:

- *Principles & Quality Standards* – accessibility, security, performance budgets.
- *Stack & Architecture Preferences* – approved frameworks, cloud/on‑prem, service boundaries.
- *Team/Process Conventions* – code review policy, testing requirements, branching strategy.
- *Style Guidelines* – lint/format rules, naming, file organization.

**Existing docs:** If you already have **Architecture** and **Constitution** files, either merge key points into `constitution.md` or **reference them directly in prompts using ****\`\`**** file references** (e.g., `@ARCHITECTURE.md`, `@constitution.md`) so the agent pulls that context automatically.

### 2) `/speckit.specify` – Define *What* to Build (The Specification)

Captures the *functional requirements* and context: **what** and **why**, *not* implementation details. Output is a detailed `spec.md` (PRD-like): overview, user stories, acceptance criteria, flows, edge cases.

**Prompt tips:** Describe outcomes and UX, avoid prescribing tech. Example:

```
/speckit.specify Build an application to organize personal photos into albums by date.
Each album shows a grid of thumbnails; users can drag and drop between albums.
Focus on a simple, modern UI and ensure offline operation.
```

Review `spec.md` carefully and iterate until it’s unambiguous.

### 3) `/speckit.clarify` – Refine Ambiguities (Iterative/Optional)

The AI highlights **ambiguities, gaps, or assumptions** in the current spec and asks clarifying questions. Address them by updating `spec.md`. Run this whenever requirements feel fuzzy.

### 4) `/speckit.plan` – Develop the Technical Plan (The “How”)

Generates a **Technical Implementation Plan** (`plan.md`) based on the spec and any tech preferences you provide. Also produces supporting docs like `research.md`, `data-model.md`, `data-contracts.md`, and `quickstart.md`.

**Prompt tips:** Specify stack/constraints (e.g., “Next.js + Tailwind; no DB, use JSON files; deploy to Vercel”). Review architectural choices and ensure alignment with the Constitution.

### 5) `/speckit.tasks` – Generate Actionable Tasks

Breaks the plan into **small, testable tasks** (`tasks.md`). Organizes by phases/sections with acceptance criteria where relevant. Edit/reorder to fit team workflow and granularity.

### 6) Quality Checks (Optional)

- \`\` – Produces domain-specific **quality checklists** (UX, security, performance, a11y, etc.) to catch blind spots.
- \`\` – Ensures **spec, plan, and tasks are consistent**; flags omissions/contradictions.

### 7) `/speckit.implement` – Execute Tasks and Generate Code

The AI implements tasks, producing code changes. Use a feature branch. **Monitor outputs** and review diffs. Consider running **task-by-task** for tighter control in large projects. Run tests and validate against the spec.

### 8) Post-Implementation

Run CI tests/QA. If requirements change, update the spec and regenerate plan/tasks to keep artifacts in sync.

---

## Using Spec Kit on Existing Projects (Brownfield Adoption)

Introduce Spec Kit into an existing repo by running `specify init` in the project root (preferably on a new branch). Then:

- **Constitution First:** Capture current stack and conventions. Summarize or **@-reference** existing **ARCHITECTURE.md** and **constitution.md** so the AI respects your reality. Keep this document current as standards evolve.
- **Spec Reflects the Current State:** For enhancements/refactors, prompt `/specify` as an **update to the existing system**. Describe what exists and the desired change. If a prior spec exists, replace/merge it to avoid drift.
- **Provide Context from Code/Docs:** Feed the AI summaries of relevant code, APIs, and design notes (snippets or generated markdown) so plans/tasks align with what you already have.
- **Implement Safely:** Prefer **iterative, task-by-task implementation**. Use a feature branch and run the app/tests between tasks. Emphasize “extend, don’t rewrite” in prompts unless a rewrite is intended.
- **Multi-Repo Considerations:** For features spanning multiple repos, maintain a master spec and run Spec Kit per repo, or break the work into sub-specs per repo.
- **Evolving Features:** Update the spec to reflect desired reality, then re-plan/re-task as needed. Skip tasks that correspond to already-complete work.

---

## Best Practices

### Do’s

- **Start with ****\`\`**** for every feature/phase.**
- **Make the spec unambiguous** and finalize it before planning. If it changes later, regenerate downstream artifacts.
- \*\*Run \*\*\`\` whenever uncertainty exists.
- **Keep tasks small and testable.** Edit tasks to the right granularity.
- **Review every artifact** (spec, plan, tasks, code). Don’t accept outputs blindly.
- **Embed existing knowledge** (architecture, design constraints) via `@` file references or summaries.
- **Version-control all artifacts** and keep them in sync with code.
- **Use tasks for tracking** (checklists, boards, issues).
- **Stay updated** with Spec Kit improvements.

### Don’ts

- **Don’t skip phases** (constitution/spec/plan/tasks). Avoid jumping straight to code.
- **Don’t treat AI output as ground truth.** Verify claims and code.
- **Don’t neglect the Constitution.** Keep it concise and current; avoid bloat.
- **Don’t let specs/plans stagnate.** Update them as code evolves.
- **Don’t create monolithic tasks** or single giant implementation passes.
- **Don’t fully automate CI/CD from day one.** Start manual, then automate gradually.
- **Don’t expect Spec Kit to replace engineering judgment** (tests, reviews, security, UX still matter).

---

## Toward CI/CD Integration

**Goal:** Treat specs as first-class citizens in your pipeline; automate gradually.

- **Spec Validation in CI:** Add jobs to lint/validate specs (e.g., run `/analyze` headless) and fail fast on inconsistencies.
- **Automate Doc Sync:** On spec changes, auto-regenerate plan/tasks and open a PR. Keep artifacts in sync with the spec.
- **Guarded Code Generation:** Later, let CI run `/implement` in a sandbox to produce a **draft PR** with generated code. Require human review before merge.
- **Quality Gates:** Tie acceptance criteria and checklists to tests where possible. Use specs to inform load, security, and a11y checks.
- **Actions & Caching:** Use GitHub Actions to run Spec Kit steps. Cache dependencies and only trigger generation when spec/plan files change.
- **Issue Tracker Integration:** Parse `tasks.md` to create issues or a project board for progress tracking.
- **Iterate:** Measure build times and failure modes; adjust automation to add value without friction.

---

## Command Flow Cheat Sheets

### Day-to-Day Feature Flow (Greenfield or Small Feature)

1. `/speckit.constitution` – confirm principles/constraints (update if needed).
2. `/speckit.specify <feature intent>` – produce/refresh `spec.md`.
3. `/speckit.clarify` – resolve ambiguities, update `spec.md`.
4. `/speckit.plan <tech direction>` – generate `plan.md` (+ support docs).
5. `/speckit.tasks` – generate `tasks.md`; refine order/scope.
6. `/speckit.analyze` – consistency pass (optional but recommended).
7. `/speckit.implement` – implement tasks (prefer iterative runs).
8. Test, review, merge; update spec/plan if anything changed.

### Starting a New Sprint

1. Refresh `/constitution` (new standards or constraints?).
2. Consolidate sprint goals in `/specify` (multiple features can reference a master sprint spec).
3. Run `/clarify` until specs are crisp.
4. Run `/plan` for each feature (or a master plan with sections per feature).
5. Run `/tasks` and convert tasks to issues/board items.
6. Parallelize `/implement` per feature branch; enforce reviews/tests.

### Brownfield Enhancement Flow

1. `/constitution` – capture current stack and policies (include `@ARCHITECTURE.md`, `@constitution.md`).
2. `/specify` – update spec to reflect current system + desired changes.
3. `/clarify` – eliminate ambiguities.
4. `/plan` – integrate with existing modules; avoid rewrites unless requested.
5. `/tasks` – small, integration‑focused tasks.
6. `/analyze` – catch drift between spec/plan/tasks.
7. `/implement` – task-by-task on a feature branch, with frequent tests.

**The following is from the spec-kit init output i find it helpful to understand the commands and their purpose:**

─────────────────────────────── Next Steps ────────────────────────────────

1. You're already in the project directory!
2. Start using slash commands with your AI agent:
   2.1 /speckit.constitution – Establish project principles  
   2.2 /speckit.specify – Create baseline specification  
   2.3 /speckit.plan – Create implementation plan  
   2.4 /speckit.tasks – Generate actionable tasks  
   2.5 /speckit.implement – Execute implementation  


──────────────────────────── Enhancement Commands ─────────────────────────────

Optional commands that you can use for your specs *(improve quality & confidence)*

○ /speckit.clarify *(optional)* – Ask structured questions to de-risk ambiguous areas before planning (run before /speckit.plan if used)  
○ /speckit.analyze *(optional)* – Cross-artifact consistency & alignment report (after /speckit.tasks, before /speckit.implement)  
○ /speckit.checklist *(optional)* – Generate quality checklists to validate requirements completeness, clarity, and consistency (after /speckit.plan)

---

## Practical Prompting Patterns

- **Reference existing docs:**
  - `@ARCHITECTURE.md` and `@constitution.md` in prompts to load context.
  - Provide small code excerpts or generated summaries for critical modules.
- **Clarity-first:** Ask the AI to list ambiguities explicitly after `/specify`.
- **Constraint reminders:** In `/plan` prompts, echo non-negotiables (performance budgets, security, stack).
- **Task size:** Ask for tasks sized to 1–3 hours of work each, with acceptance criteria.
- **Iterative implementation:** “Implement the next task only. Stop after completion and summarize changes.”
- **Safety:** “Extend existing modules; do not rewrite unless instructed.”

---

## Final Notes

Spec Kit streamlines development by enforcing clarity upfront and turning specifications into executable blueprints. Keep your Constitution sharp, your Specs unambiguous, your Plans pragmatic, and your Tasks small. Treat the AI like a capable junior dev: guide it, inspect its work, and iterate. With practice, you’ll deliver higher quality software faster while maintaining excellent documentation and a clear trail from intent to implementation.

