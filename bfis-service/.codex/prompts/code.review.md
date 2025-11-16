---
description: Perform a lightweight code review of one or more files and produce a tailored written summary.
---

## User Input

```text
$ARGUMENTS
```

Proceed only after required arguments are provided. If any are missing, pause and ask the user for them (see Argument Requirements). Otherwise, consider the provided input and continue.

## Argument Requirements

If no arguments are provided, first tell the user which arguments are needed and ask them to supply them.

- Required
  - `--path` Repository‑relative file, directory, or glob to review (e.g., `services/olympus-gateway/src`, `services/olympus-gateway/src/index.js`, `services/olympus-gateway/**/*.js`).
  - `--output` Natural‑language description of the desired review style and intended destination, e.g.:
    - `"short bullet summary for PR comment"`
    - `"high‑level architecture notes for docs/context/gateway-review.md"`
    - `"beginner‑friendly walkthrough for new contributors"`

Derived variables used below: {path}, {output_spec}

## Outline

Act as a calm, constructive reviewer. Your job is to read the code under `{path}`, detect the languages in use, and then produce a concise written review that matches `{output_spec}`. Do not execute any code.

1. Parse input
   - Extract:
     - `--path "{path}"`
     - `--output "{output_spec}"`
   - If either is missing, ask the user for the missing value and give a simple example.

2. Resolve target code
   - Interpret `{path}` as:
     - A single file, or
     - A directory (recurse into it), or
     - A glob pattern.
   - Collect relevant source files (e.g., `.js`, `.ts`, `.py`, `.go`, `.java`, `.rb`, `.cs`, `.rs`, `.php`, `.swift`, `.kt`).
   - If no matching files are found: report a clear ERROR and suggest a corrected `--path`.

3. Detect languages and roles
   - Infer language from file extensions and common project files (e.g., `package.json`, `go.mod`, `pyproject.toml`).
   - Group files by language or obvious role where helpful (e.g., "HTTP handlers", "models", "tests", "scripts").

4. Read code only
   - Skim the collected files; focus on:
     - Public entrypoints and APIs
     - Key functions/classes
     - Error handling and validation
     - External calls (APIs, DBs, queues, services)
   - Do not modify or run any code; this is a read‑only analysis.

5. Interpret `{output_spec}`
   - Treat `{output_spec}` as the user's instructions for:
     - Tone and depth (e.g., "short and high‑level", "more detailed", "for juniors").
     - Format (e.g., bullets, short narrative).
     - Intended destination (e.g., "PR comment", "architecture doc", "onboarding notes").
   - Adapt your response accordingly while staying clear and concise.

6. Prepare the review
   - Keep the tone neutral, supportive, and non‑dramatic.
   - Focus on:
     - What the code appears to do.
     - Notable strengths or nice patterns.
     - A small number of clear, concrete improvement ideas.
   - Avoid over‑analyzing or inventing speculative problems; comment only on what you can see.

7. Produce the output (see Output Format)
   - Shape the structure and emphasis to align with `{output_spec}`.
   - If `{output_spec}` mentions a file path (e.g., `docs/...`), you still write the review in this chat; optionally start with a line like `Suggested location: docs/...`.

## Output Format

Use this as a default shape when `{output_spec}` does not request something very specific. Adjust headings, length, or tone to better match `{output_spec}` when needed.

1. Summary
   - 2–5 short bullets describing:
     - Overall impression of the code under `{path}`.
     - Main strengths.
     - Main opportunities for improvement.

2. Notable Strengths
   - 3–7 bullets highlighting positive aspects (e.g., clarity, structure, tests, error handling).

3. Opportunities / Suggestions
   - 3–10 bullets with concrete, practical suggestions.
   - Prefer actionable guidance over strict rules (e.g., "Consider extracting X into a helper for reuse" instead of "This is wrong").

If `{output_spec}` clearly asks for a different style (e.g., "one paragraph summary", "checklist for refactor", "notes for onboarding doc"), follow that instead of the default sections above.

## Error Handling

- If `{path}` cannot be resolved or yields no code files:
  - Respond with a brief ERROR message and suggest the user adjust `--path` (give one or two example paths).
- If the path is very large:
  - Skim representative files instead of exhaustively reading everything.
  - Note that the review is based on a sample, not every file.
- If `{output_spec}` is too vague:
  - Ask one quick clarifying question or choose a reasonable default (short, high‑level summary) and state the assumption you used.

