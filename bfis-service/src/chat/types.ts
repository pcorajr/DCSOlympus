/**
 * Chat interface types for BFIS human-in-the-loop Copilot mode.
 *
 * Per Spec-005: Transform BFIS from autonomous polling to chat-based interaction
 * where humans initiate all actions and explicitly approve decisions.
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/specs/005-bfis-chat-interface.md | Spec-005}
 */

import type { BfisDecision } from "../../../shared-schemas/index.js";

/**
 * Chat message role types.
 */
export type ChatMessageRole = "human" | "assistant" | "system";

/**
 * Chat message in conversation history.
 */
export interface ChatMessage {
  /** Message role (human, assistant, or system) */
  role: ChatMessageRole;
  /** Message content text */
  content: string;
  /** ISO 8601 timestamp when message was created */
  timestamp: string;
  /** Optional metadata for tool calls, proposed actions, etc. */
  metadata?: {
    /** Tool calls made by LLM (tool names) */
    toolCalls?: string[];
    /** Proposed action decision IDs awaiting approval */
    proposedActions?: string[];
  };
}

/**
 * Response from Dialogue Manager after processing human message.
 */
export interface DialogueResponse {
  /** Assistant's text response to the human */
  response: string;
  /** Optional proposed decision requiring human approval */
  proposedDecision?: {
    /** Unique decision ID for approval tracking */
    decisionId: string;
    /** Full BFIS decision with actions and reasoning */
    decision: BfisDecision;
    /** Human-readable reasoning for the decision */
    reasoning: string;
    /** Always true - indicates approval is required */
    requiresApproval: true;
  };
  /** Conversation/session ID for tracking */
  conversationId: string;
}

/**
 * Result of executing approved actions.
 */
export interface ExecutionResult {
  /** Decision ID that was executed */
  decisionId: string;
  /** Whether the decision was approved (true) or rejected (false) */
  approved: boolean;
  /** Command execution results if approved */
  commandResults?: Array<{
    commandHash: string;
    status: "SENT" | "CONFIRMED" | "FAILED" | "LOGGED";
    error?: string;
  }>;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Pending decision awaiting human approval.
 */
export interface PendingDecision {
  /** Unique decision ID */
  decisionId: string;
  /** Session ID this decision belongs to */
  sessionId: string;
  /** Full BFIS decision with actions and reasoning */
  decision: BfisDecision;
  /** ISO 8601 timestamp when decision was proposed */
  proposedAt: string;
  /** ISO 8601 timestamp when decision expires (default: 5 minutes) */
  expiresAt: string;
  /** Current status of the decision */
  status: "pending" | "approved" | "rejected" | "expired";
}

/**
 * Request body for POST /bfis/chat/message endpoint.
 */
export interface ChatMessageRequest {
  /** Human's message text */
  message: string;
  /** Session ID for conversation tracking */
  sessionId: string;
  /** Optional session hash for snapshot context */
  sessionHash?: string;
}

/**
 * Response body for POST /bfis/chat/message endpoint.
 */
export interface ChatMessageResponse {
  /** Assistant's response text */
  response: string;
  /** Optional proposed actions requiring approval */
  proposedActions?: BfisDecision;
  /** Decision ID if actions were proposed */
  decisionId?: string;
  /** Whether human approval is required */
  requiresApproval: boolean;
}

/**
 * Request body for POST /bfis/chat/approve endpoint.
 */
export interface ChatApprovalRequest {
  /** Session ID */
  sessionId: string;
  /** Decision ID to approve/reject */
  decisionId: string;
  /** Whether to approve (true) or reject (false) */
  approved: boolean;
}

/**
 * Response body for POST /bfis/chat/approve endpoint.
 */
export interface ChatApprovalResponse {
  /** Decision ID that was processed */
  decisionId: string;
  /** Whether it was approved */
  approved: boolean;
  /** Execution results if approved */
  executionResults?: Array<{
    commandHash: string;
    status: string;
    error?: string;
  }>;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Response body for GET /bfis/chat/history endpoint.
 */
export interface ChatHistoryResponse {
  /** Session ID */
  sessionId: string;
  /** Array of chat messages in chronological order */
  messages: ChatMessage[];
  /** Total message count */
  totalMessages: number;
}
