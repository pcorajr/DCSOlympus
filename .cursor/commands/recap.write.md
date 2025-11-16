---
description: Generate a session recap from conversation context using the session recap template.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

The user input after `/recap.write` describes what work was completed and should be recapped. Use your **conversation context** (this chat history) to fill the recap template with accurate information about what was discussed, decided, implemented, and resolved.

1. **Parse user description**: Extract the focus/intent from the user's message (e.g., "recap of the work we just completed to create the new spec")

2. **Generate timestamp**: Create `YYYY-MM-DD-HHMM` format from current local time

3. **Load template**: Read `docs/context/session_recap_template.md`
   - If template not found: ERROR "Template not found at docs/context/session_recap_template.md"

4. **Fill template using conversation context** (NOT git history):
   
   Use your full conversation context to populate:
   - **Title**: From user description or inferred from conversation topic
   - **Date**: From timestamp (YYYY-MM-DD format)
   - **Session Time**: Infer from conversation or set "N/A" if unclear
   - **Status**: Infer from conversation (Complete/Partial/Blocked/Draft)
   - **Agent**: Default "cursor-agent" or infer from conversation
   - **Mode/Identity**: Infer from conversation (e.g., Build, Plan, Review, Debug)
   - **Workspace**: Current working directory or repo root
   - **Focus**: Feature/system/document discussed in conversation
   - **Outcomes**: Summarize what was discussed, changed, decided, committed, or verified in the conversation
   - **Issues & Resolutions**: Extract problems mentioned in conversation and how they were fixed
   - **Decisions**: Key choices discussed with reasoning
   - **Tasks Completed**: List deliverables, features, or steps mentioned in conversation
   - **Next Tasks**: Inferred from conversation or ask user if unclear
   - **Test/Verification**: Commands, tests, or validation criteria mentioned in conversation
   - **Linked Context**: Files, features, specs, ADRs, or branches discussed
   - **Lessons/Notes**: Insights, improvements, or takeaways from the conversation

5. **Generate filename**: `session_[YYYY-MM-DD-HHMM]_[AGENT]_[KEY].md`
   - AGENT: from recap (default "cursor-agent")
   - KEY: derived from title (lowercase, spaces→dashes, e.g., "Base Image Policy" → "base-image-policy")
   - If file exists at `docs/context/session_[TIMESTAMP]_[AGENT]_[KEY].md`, append `-v2`, `-v3`, etc.

6. **Write recap**: Save filled template to `docs/context/session_[TIMESTAMP]_[AGENT]_[KEY].md`
   - Ensure `docs/context/` directory exists (create if needed)
   - Replace all template placeholders with actual content
   - Remove placeholder markers like `[NEEDS CLARIFICATION]`

7. **Report**: SUCCESS with file path and brief summary of what was captured

## Key Principles

- **Use conversation context directly**: You have full chat history - use it. Do not infer from git commits or file system changes.
- **Works for all scenarios**: Committed work, uncommitted changes, exploratory discussions, ask mode conversations, planning sessions
- **Capture intent**: Recap what was *discussed* and *intended*, not just what was committed
- **Be specific**: Include concrete examples, file paths, commands, decisions mentioned in conversation
- **Remove placeholders**: Do not leave `[Placeholder]` or `[NEEDS CLARIFICATION]` markers in the final recap

## Error Handling

- If template file missing: ERROR with clear message
- If output directory cannot be created: ERROR with details
- If user input is empty and context is insufficient: Ask user for brief description of work to recap


