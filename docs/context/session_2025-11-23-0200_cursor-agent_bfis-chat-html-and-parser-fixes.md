# Session Recap: BFIS Chat HTML Interface and Tool Calling Parser Fixes
**Date**: 2025-11-23
**Session Time**: ~01:00-02:00 UTC
**Status**: Partial
**Agent**: cursor-agent

## Session Context
- **Mode**: Build / Debug
- **Identity**: Auto (Cursor AI Assistant)
- **Workspace**: /home/dcs/DCSOlympus
- **Focus**: BFIS chat interface HTML test page, tool calling parser improvements, snapshot duplication identification

## Tools & Capabilities
- **Read-only tools**: codebase_search, grep, file_search, read_file, list_dir
- **Write tools**: Available (agent mode)
- **Agent Permissions**: Full access
- **Network Access**: Enabled (browser testing)
- **Search Capabilities**: Local codebase search

## Outcomes
- Created HTML test page at `bfis-service/src/chat/public/index.html` for easy chat interface testing
- Added static file serving to Express HTTP server with root route handler
- Fixed tool calling parser to handle multiple LLM response formats (`<|channel|>`, `<|message|>`, `functions.` vs `tool.` prefixes)
- Identified snapshot duplication issue where multiple tools fetch the same snapshot independently
- Added port mapping (4513:4513) to docker-compose.yml for host access
- Improved error handling and logging in LLM client tool parsing

## Issues & Resolutions
- **HTML page not serving**: Fixed path resolution in `http-server.ts` to use `process.cwd()` for dev mode, added explicit root route handler
- **Tool calls returning raw format**: LLM was returning formats like `<|channel|>commentary to=tool.get_unit_info <|constrain|>json<|message|>{"coalition":"RED"}` instead of executing tools. Updated parser to extract JSON from `<|message|>` tags and tool names from `to=functions.` or `to=tool.` patterns
- **Parser breaking on nested JSON**: Fixed JSON extraction to use balanced brace matching instead of regex that failed on nested objects/arrays
- **Invalid tool calls**: LLM sometimes calls non-existent tools like `container.exec`. Added validation and clearer prompts listing only available tools
- **Snapshot duplication**: Identified that each Intel tool calls `readContextOnce()` independently, causing redundant fetches when multiple tools are called in one response

## Decisions
- Use balanced brace matching for JSON extraction to handle nested structures correctly
- Extract tool names from format strings when JSON doesn't contain a "tool" field
- Keep parser flexible to handle multiple LLM output formats (defensive parsing)
- Consider MCP layer for better tool calling protocol in future (discussed but not implemented)

## Tasks Completed
- Created `bfis-service/src/chat/public/index.html` with chat interface UI
- Updated `bfis-service/src/chat/http-server.ts` to serve static files and handle root route
- Updated `bfis-service/src/intent/llm-client.ts` parser to handle `<|message|>` format and extract tool names from format strings
- Added port mapping to `bfis-service/docker-compose.yml`
- Improved error messages when invalid tools are called
- Enhanced prompts to explicitly list available tools and warn against special formatting

## Next Tasks
- Refactor snapshot fetching: fetch once in `processMessage()` and pass to tools instead of each tool fetching independently
- Implement MCP layer for standardized tool calling protocol (discussed as better long-term solution)
- Add better logging/debugging for tool call parsing failures
- Test tool execution end-to-end to ensure tools actually execute and return natural language responses
- Verify snapshot freshness in chat path

## Test / Verification
- HTML page accessible at `http://localhost:4513/` (verified working)
- Chat interface functional for basic queries
- Tool calling parser handles multiple formats but execution still inconsistent (LLM sometimes returns raw format)
- Docker service rebuilt multiple times during debugging

## Linked Context
- Code: `bfis-service/src/chat/http-server.ts`, `bfis-service/src/chat/public/index.html`, `bfis-service/src/intent/llm-client.ts`, `bfis-service/src/chat/dialogue-manager.ts`, `bfis-service/src/agents/tools/intel-tools.ts`
- Config: `bfis-service/docker-compose.yml`
- Docs: `docs/architecture/spec-005.md`

## Lessons / Notes
- LLM tool calling remains fragile with ad-hoc JSON parsing; MCP layer would provide more robust foundation
- Path resolution in Docker dev mode requires careful handling of `process.cwd()` vs `__dirname`
- Snapshot duplication is a performance issue that should be addressed by passing snapshots to tools
- Parser needs to be defensive and handle multiple format variations from the LLM
- HTML test page significantly improves testing workflow vs curl commands

