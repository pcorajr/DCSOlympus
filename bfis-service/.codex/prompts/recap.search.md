---
description: Search all session recaps for specific content or topics.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

The user wants to search all session recaps for specific content. Extract the search query from their message (e.g., "search all recaps until you find where we worked on xyz" → search term is "xyz").

1. **Extract search term**: Parse query from user input
   - Look for patterns: "where we worked on X", "find X", "search for X", "recaps about X"
   - Common patterns:
     - "search all recaps until you find where we worked on [TERM]" → TERM
     - "find recaps about [TERM]" → TERM
     - "search for [TERM] in recaps" → TERM
     - "where did we work on [TERM]" → TERM
   - If no clear term found and input is not empty: Use entire input as search term
   - If empty: ERROR "No search term provided"

2. **List recap files**: Find all `session_*.md` files in `docs/context/`
   - Pattern: `docs/context/session_*.md`
   - If no files found: ERROR "No session recaps found in docs/context/"

3. **Search each file**: For each recap file:
   - Read file content
   - Search for query term (case-insensitive, substring match)
   - Track matches with:
     - File name
     - Date (from filename or recap header)
     - Section(s) containing match
     - Context lines (2-3 lines before/after match)

4. **Rank results**: Order by relevance
   - Title match (query in recap title) = highest priority
   - Section header match (query in section heading) = high priority
   - Content match (query in body) = medium priority
   - Within each tier, sort by newest first

5. **Format output**: For each match:
   - **File**: `session_[DATE]_[AGENT]_[KEY].md`
   - **Date**: From filename or recap header
   - **Section**: Which section contains the match (e.g., "Outcomes", "Issues & Resolutions", "Decisions")
   - **Excerpt**: 2-3 lines of context around the match
   - Include line number or paragraph reference if helpful

6. **Report**: Present all matches in ranked order
   - If no matches: Report "No recaps found containing '[search term]'"
   - If matches found: Show all results grouped by file

## Output Format

```
Found [N] recap(s) containing "[search term]":

## [Filename] - [Date]
**Section**: [Section name]
**Context**:
```
[2-3 lines before match]
[Match line highlighted or indicated]
[2-3 lines after match]
```

## [Next Match]
...
```

## Error Handling

- If no search term: ERROR "No search term provided. Example: /recap.search where we worked on base-image-policy"
- If no recap files found: ERROR "No session recaps found in docs/context/"
- If no matches found: Report clearly with search term used
- If file cannot be read: Note in output and continue with other files


