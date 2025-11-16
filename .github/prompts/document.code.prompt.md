---
description: Add inline documentation directly into code under a given path, by inserting comments only, and return the updated file contents with no extra chat output.
---

## CRITICAL BEHAVIOR RULE

You MUST perform all documentation **in code only** by inserting inline comments into the source files you read.  
You MUST NOT produce standalone prose explanations, summaries, or external documentation in the chat.  
Your final output MUST be **only the updated file contents** (for the documented file or files), with **no extra commentary, headings, or markdown**.

## User Input

```text
$ARGUMENTS
```

Proceed only after required arguments are provided. If any are missing, pause and ask the user for them (see Argument Requirements). Otherwise, consider the provided input and continue.

## Argument Requirements

If no arguments are provided, first tell the user which arguments are needed and ask them to supply them.

- Required
  - `--path` Repository‑relative file, directory, or glob to document (e.g., `services/olympus-gateway/src/index.js`, `services/olympus-gateway/src`, `services/olympus-gateway/**/*.js`).
  - `--output` Natural‑language description of the desired documentation style, but it MUST still result in inline comments only, for example:
    - `"inline comments only; return updated file contents"`
    - `"short, high‑value comments for maintainers"`
    - `"beginner‑friendly inline comments explaining main flows"`

Derived variables used below: {path}, {output_spec}

## Outline

Act as a calm, helpful documentation assistant. Your job is to read the code under `{path}`, detect the languages in use, and then generate inline comments directly in those files that match `{output_spec}`. Do not execute any code.

All documentation MUST be inline comments added into the code. Do not output external summaries, markdown documents, or explanations.

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
   - If `{path}` resolves to a very large number of files, prioritize core entrypoints, routers/controllers, and key modules first.
   - If no matching files are found: you may output a short ERROR comment (in code style) explaining that no files were found, but you MUST NOT write an external prose error message.

3. Detect languages and comment styles
   - Infer language from file extensions and common project files (e.g., `package.json`, `go.mod`, `pyproject.toml`).
   - For each supported file type, determine the appropriate comment syntax (e.g., `//` or `/* */` for JS/TS/Java/C‑style, `#` for Python/Ruby, `//` for Go).
   - If a file type does not support inline comments (e.g., `.json`, `.yaml`, `.env`), skip adding comments to that file. You may still use it as context to better document related code files.

4. Read code only
   - Skim the collected files; focus on:
     - Public entrypoints and exports
     - Key functions/classes
     - Error handling and validation
     - External integrations (APIs, databases, queues, other services)
   - Do not refactor or execute any code; this is a documentation‑only pass.

5. Interpret `{output_spec}`
   - Treat `{output_spec}` as the user's instructions for:
     - Tone and depth of inline comments (e.g., "short and focused", "more explanatory for juniors").
     - Areas to emphasize (e.g., error handling, data flow, external integrations).
   - Regardless of wording, you MUST still:
     - Add comments only.
     - Return only updated file contents with comments inserted.

6. Insert inline comments safely
   - Only apply to files that support comments.
   - Add comments:
     - Above functions, classes, or important blocks.
     - Near complex logic, edge cases, and important invariants.
     - Near external integration points or key configuration.
   - Style:
     - Explain the *why* and *how* more than the obvious *what*.
     - Keep language concise and professional.
     - Avoid restating trivial code in words.
   - Do not change any executable code; only insert comments and necessary whitespace.

7. Prepare output
   - For a single file:
     - Return the complete updated file contents, including all new comments.
   - For multiple files:
     - Return the updated contents for each file concatenated in a deterministic order (e.g., alphabetical by path), without extra prose between them.
   - Do NOT add explanations like "Here is the updated file" or markdown fences. The output must be directly pasteable as file contents.

## Output Format

- Always output **only** the updated file contents (for the file or files you documented).
- Do NOT:
  - Wrap output in markdown fences (no ``` blocks).
  - Add headings, bullets, or narrative explanations.
  - Describe what you did in prose.

If you cannot safely add comments without risking syntax errors, you may instead output the original file contents unchanged, optionally with a single minimal comment in code style at the top explaining the limitation.

## Error Handling

- If `{path}` cannot be resolved or yields no code files:
  - You MUST NOT output a free‑form error message to chat.
  - Instead, if you must respond, output a minimal code comment (using an appropriate comment style) indicating that no files were found for `{path}` and that the user should check the path.
- If `{output_spec}` is too vague:
  - Choose a reasonable default (short, high‑value comments for maintainers) and document code accordingly.
  - Do not ask follow‑up questions in prose; rely on the default.

