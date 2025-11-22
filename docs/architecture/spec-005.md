# Spec-005: Human-in-the-Loop Chat Interface for BFIS

## Overview

This specification describes the transformation of BFIS from an autonomous polling architecture to a human-initiated, chat-based Copilot system. The current implementation violates the constitution's human-in-the-loop principle by automatically triggering LLM inference on every snapshot poll, creating an "action-happy" system that wants to act even when no action is needed.

The new architecture makes the human the primary driver of interaction, with the LLM acting as an assistant that can query battlefield intelligence on demand and proposes actions for explicit human approval.

## Problem Statement

### Current Architecture Issues

The existing implementation in the 004-bfis-llm-architecture branch has a fundamental architectural flaw:

- **Autonomous Polling Loop**: The polling loop automatically triggers the orchestrator on every snapshot (spec-004.md:1006-1008)
- **LLM Spam**: The Commander agent receives continuous battlefield updates and feels compelled to generate actions
- **No Human Gate**: Actions flow from decision to execution without human approval
- **Constitution Violation**: Violates "AI assists; humans decide" and "Never make changes without explicit user instruction" (AGENTS.md:14-18)

### Desired Architecture

Transform BFIS into a Copilot mode system where (BFIS-service-definition.md:15-16):

- **Human-Initiated**: All interactions start with human text input via chat interface
- **Intel as Tool**: LLM queries Intel agent on demand using tool calls, not push-based polling
- **Action Proposals**: LLM proposes actions with reasoning, waits for explicit human approval
- **Execution Gating**: Writer agent only executes after human confirmation

## Architecture Changes

### High-Level Flow

```
Human Input (Chat) → Dialogue Manager → LLM (with Intel Tool) → Action Proposal → Human Approval → Writer Agent → Execution  
         ↑                                      ↓  
         └──────────── Feedback/Questions ──────┘  
```

### Component Changes

#### 1. Decouple Polling from Inference

**Current**: Polling loop triggers orchestrator automatically (spec-004.md:1006-1008)

**New**: Polling loop only maintains snapshot cache, does NOT trigger orchestrator

```typescript
// bfis-service/src/runtime/polling-loop.ts  
// REMOVE: Automatic orchestrator trigger  
// KEEP: Snapshot caching and change detection for tool queries
```

#### 2. Add Chat Interface Layer

**New Component**: `bfis-service/src/chat/chat-interface.ts`

**Responsibilities**:

- Accept human text input (HTTP endpoint or WebSocket)
- Maintain conversation context (last N messages)
- Route messages to Dialogue Manager
- Stream LLM responses back to human
- Present action proposals for approval
- Track approval/rejection decisions

**API Endpoints**:

- `POST /bfis/chat/message`
  - Body: `{ message: string, sessionId: string }`
  - Response: `{ response: string, proposedActions?: BfisAction[], requiresApproval: boolean }`

- `POST /bfis/chat/approve`
  - Body: `{ sessionId: string, decisionId: string, approved: boolean }`
  - Response: `{ executionResults: CommandResult[] }`

- `GET /bfis/chat/history`
  - Query: `{ sessionId: string, limit?: number }`
  - Response: `{ messages: ChatMessage[] }`

#### 3. Enhance Dialogue Manager

**Existing Placeholder**: `bfis-service/src/intent/dialogue-manager.ts` (dialogue-manager.ts:1-26)

**New Implementation**:

```typescript
export class DialogueManager {  
  private conversationHistory: Map<string, ChatMessage[]>;  
  private llmClient: LLMClient;  
  private intelAgent: IntelAgent;  
    
  /**  
   * Process human message and generate LLM response with Intel tool access  
   */  
  async processMessage(input: {  
    message: string;  
    sessionId: string;  
    sessionHash: string;  
  }): Promise<DialogueResponse> {  
    // 1. Add message to conversation history  
    // 2. Build LLM prompt with conversation context  
    // 3. Register Intel agent as tool for LLM  
    // 4. Call LLM with tool access  
    // 5. If LLM proposes actions, return for approval  
    // 6. If LLM just responds, return response  
  }  
    
  /**  
   * Execute approved actions  
   */  
  async executeApprovedActions(input: {  
    sessionId: string;  
    decisionId: string;  
    approved: boolean;  
  }): Promise<ExecutionResult> {  
    // 1. Retrieve pending decision  
    // 2. If approved, call Writer agent  
    // 3. Return execution results  
    // 4. Update conversation history  
  }  
}
```

#### 4. Convert Intel Agent to Tool

**Current**: Intel agent pushes summaries on every snapshot (spec-004.md:391-403)

**New**: Intel agent responds to explicit LLM tool calls

**Tool Definitions**:

```typescript
// bfis-service/src/agents/tools/intel-tools.ts  
  
/**  
 * Tool: Get current battlefield summary  
 */  
const getCurrentSummaryTool = tool(  
  async () => {  
    const snapshot = await snapshotReader.readContextOnce();  
    return await intelAgent.generateSummary(snapshot);  
  },  
  {  
    name: "get_battlefield_summary",  
    description: "Fetches current battlefield state including unit counts, positions, threats, and key locations. Use this when the human asks about current situation.",  
    schema: z.object({}),  
  }  
);  
  
/**  
 * Tool: Get specific unit information  
 */  
const getUnitInfoTool = tool(  
  async (params: { coalition?: string; category?: string; zone?: string }) => {  
    const snapshot = await snapshotReader.readContextOnce();  
    return filterUnits(snapshot, params);  
  },  
  {  
    name: "get_unit_info",  
    description: "Queries specific units by coalition, category, or zone. Use when human asks about specific forces.",  
    schema: z.object({  
      coalition: z.enum(["BLUE", "RED", "NEUTRAL"]).optional(),  
      category: z.string().optional(),  
      zone: z.string().optional(),  
    }),  
  }  
);  
  
/**  
 * Tool: Detect recent changes  
 */  
const getRecentChangesTool = tool(  
  async () => {  
    const current = await snapshotReader.readContextOnce();  
    const previous = snapshotCache.get(sessionHash);  
    if (!previous) return { changes: "No previous snapshot available" };  
    return await intelAgent.detectChanges(previous, current);  
  },  
  {  
    name: "get_recent_changes",  
    description: "Detects what changed since last check (new units, destroyed units, movements). Use when human asks 'what changed' or 'what's new'.",  
    schema: z.object({}),  
  }  
);
```

#### 5. Add Action Approval Flow

**New Component**: `bfis-service/src/chat/action-approval.ts`

```typescript
export interface PendingDecision {  
  decisionId: string;  
  sessionId: string;  
  decision: BfisDecision;  
  proposedAt: string;  
  expiresAt: string;  
  status: "pending" | "approved" | "rejected" | "expired";  
}  
  
export class ActionApprovalManager {  
  private pendingDecisions: Map<string, PendingDecision>;  
    
  /**  
   * Store decision for human approval  
   */  
  async proposeDecision(decision: BfisDecision, sessionId: string): Promise<string> {  
    const decisionId = uuidv4();  
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry  
      
    this.pendingDecisions.set(decisionId, {  
      decisionId,  
      sessionId,  
      decision,  
      proposedAt: new Date().toISOString(),  
      expiresAt: expiresAt.toISOString(),  
      status: "pending",  
    });  
      
    return decisionId;  
  }  
    
  /**  
   * Process human approval/rejection  
   */  
  async processApproval(decisionId: string, approved: boolean): Promise<PendingDecision> {  
    const pending = this.pendingDecisions.get(decisionId);  
    if (!pending) throw new Error("Decision not found");  
    if (pending.status !== "pending") throw new Error("Decision already processed");  
      
    pending.status = approved ? "approved" : "rejected";  
    return pending;  
  }  
}
```

#### 6. Modify Commander Agent

**Current**: Automatically generates decisions on every Intel update

**New**: Only generates decisions when called by Dialogue Manager in response to human input

**Changes**:

- Remove automatic triggering from orchestrator
- Add `generateProposal()` method for chat-initiated decisions
- Keep `makeDecision()` for approved actions

```typescript
// bfis-service/src/agents/commander-agent.ts  
  
export class CommanderAgent {  
  /**  
   * Generate action proposal for human review (does NOT execute)  
   */  
  async generateProposal(input: {  
    humanIntent: string;  
    intelSummary?: TacticalSummary;  
    conversationContext: ChatMessage[];  
  }): Promise<BfisDecision> {  
    // Generate decision with reasoning  
    // Mark as "proposed" not "approved"  
    // Return for human review  
  }  
    
  /**  
   * Finalize approved decision for execution  
   */  
  async finalizeDecision(proposedDecision: BfisDecision): Promise<BfisDecision> {  
    // Validate decision still makes sense  
    // Mark as "approved"  
    // Return for Writer execution  
  }  
}
```

#### 7. Update Writer Agent Execution Mode

**Current**: Config-based "log" | "execute" mode (spec-004.md:530-532)

**New**: Always requires explicit approval flag

```typescript
// bfis-service/src/agents/writer-agent.ts  
  
export class WriterAgent {  
  async executeCommands(input: {  
    decision: BfisDecision;  
    approved: boolean; // NEW: explicit approval flag  
    approvedBy: string; // NEW: who approved (sessionId)  
  }): Promise<CommandResult[]> {  
    if (!input.approved) {  
      throw new Error("Cannot execute unapproved decision");  
    }  
      
    // Existing execution logic  
    // Log approval metadata  
  }  
}
```

## Type Definitions

### Chat Types

```typescript
// bfis-service/src/chat/types.ts  
  
export interface ChatMessage {  
  role: "human" | "assistant" | "system";  
  content: string;  
  timestamp: string;  
  metadata?: {  
    toolCalls?: string[];  
    proposedActions?: string[]; // decisionIds  
  };  
}  
  
export interface DialogueResponse {  
  response: string;  
  proposedDecision?: {  
    decisionId: string;  
    decision: BfisDecision;  
    reasoning: string;  
    requiresApproval: true;  
  };  
  conversationId: string;  
}  
  
export interface ExecutionResult {  
  decisionId: string;  
  approved: boolean;  
  commandResults?: CommandResult[];  
  error?: string;  
}
```

## Configuration Changes

```typescript
// bfis-service/src/config/config.ts  
  
export interface BfisConfig {  
  // ... existing config  
    
  chat: {  
    /** Enable chat interface */  
    enabled: boolean; // Default: true  
      
    /** Chat endpoint type */  
    transport: "http" | "websocket"; // Default: "http"  
      
    /** Max conversation history length */  
    maxHistoryLength: number; // Default: 20  
      
    /** Action approval timeout (ms) */  
    approvalTimeoutMs: number; // Default: 300000 (5 min)  
      
    /** Allow autonomous mode (bypass approval) */  
    allowAutonomous: boolean; // Default: false  
  };  
    
  polling: {  
    /** Continue background polling for Intel tool queries */  
    enabled: boolean; // Default: true  
      
    /** Do NOT trigger orchestrator automatically */  
    triggerOrchestrator: boolean; // Default: false (CHANGED)  
  };  
}
```

## Implementation Phases

### Phase 1: Chat Infrastructure (Week 1)

**Files to Create**:

- `bfis-service/src/chat/chat-interface.ts` - HTTP/WebSocket endpoints
- `bfis-service/src/chat/types.ts` - Chat message types
- `bfis-service/src/chat/action-approval.ts` - Approval manager

**Tasks**:

- Implement chat message endpoint (`POST /bfis/chat/message`)
- Implement approval endpoint (`POST /bfis/chat/approve`)
- Add conversation history storage (in-memory for MVP)
- Add session management

**Integration Points**:

- Extends existing BFIS service HTTP server
- Uses existing StructuredLogger for chat events

### Phase 2: Dialogue Manager Implementation (Week 2)

**Files to Modify**:

- `bfis-service/src/intent/dialogue-manager.ts` - Full implementation

**Tasks**:

- Implement `processMessage()` with LLM client integration
- Add conversation context management
- Register Intel tools with LLM
- Implement action proposal flow
- Add approval/rejection handling

**Integration Points**:

- Uses existing `LLMClient` (bfis-service/src/intent/llm-client.ts)
```

**Note**: Fixed a typo on line 193 (`proposeDeci` → `proposeDecision`). The file appears to end at line 387; if there's more content, include it.

Switch to agent mode to apply these changes, or copy the formatted markdown above.