---
description: Read the latest N session recaps and extract Issues & Resolutions sections.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

The user wants to read the latest session recaps and extract all issues encountered and how they were fixed. Parse the number N from the input (default: 2 if not specified).

1. **Parse input**: Extract number N from user message
   - Look for patterns: "latest two", "last 3", "latest N", "read the latest two recaps", etc.
   - Default: N = 2 if no number found
   - Examples:
     - "read the latest two recaps" → N = 2
     - "read latest 3 recaps" → N = 3
     - "latest recaps" → N = 2 (default)

2. **List recap files**: Find all `session_*.md` files in `docs/context/`
   - Pattern: `docs/context/session_*.md`
   - If no files found: ERROR "No session recaps found in docs/context/"

3. **Sort by modification time**: Order files newest first (most recently modified)
   - Use file modification timestamp

4. **Read top N files**: Load the N newest recap files

5. **Extract Issues & Resolutions**: For each recap file:
   - Find the "## Issues & Resolutions" section
   - Extract all issue entries (each issue typically has problem, resolution, impact)
   - Parse structured format if present (e.g., "Issue 1:", "Problem:", "Resolution:", "Impact:")

6. **Format output**: Present grouped by recap file, then by issue
   - For each recap:
     - Show file name and date (from filename or recap header)
     - List all issues with format:
       - **Issue**: [Description]
       - **Resolution**: [How it was fixed]
       - **Impact**: [Impact level if mentioned]
   - Group clearly by file (use horizontal rule or header between files)

7. **Report**: Present all issues and resolutions in a clear, readable format

## Output Format

For each recap file:
```
## [Filename] - [Date]

### Issue 1: [Title/Description]
**Problem**: [What went wrong]
**Resolution**: [How it was fixed]
**Impact**: [Impact level - High/Medium/Low, if mentioned]

### Issue 2: [Title/Description]
...
```

## Error Handling

- If no recap files found: ERROR "No session recaps found in docs/context/"
- If N > available files: Use all available files and inform user
- If "Issues & Resolutions" section missing: Note in output that the recap has no issues documented
- If section exists but is empty: Note that no issues were recorded for that recap


