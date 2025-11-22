/**
 * Action Approval Manager for BFIS human-in-the-loop workflow.
 *
 * Manages pending decisions awaiting human approval, tracks approval status,
 * and enforces expiration timeouts.
 *
 * Per Spec-005: All actions must be explicitly approved by humans before execution.
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/specs/005-bfis-chat-interface.md | Spec-005}
 */

import type { BfisDecision } from "../../../shared-schemas/index.js";
import type { PendingDecision } from "./types.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Action Approval Manager.
 *
 * Stores pending decisions, tracks approval status, and enforces expiration timeouts.
 * Decisions expire after a configurable timeout (default: 5 minutes).
 */
export class ActionApprovalManager {
  private readonly pendingDecisions: Map<string, PendingDecision>;
  private readonly approvalTimeoutMs: number;

  constructor(
    private readonly logger: StructuredLogger,
    approvalTimeoutMs: number = 300000 // 5 minutes default
  ) {
    this.pendingDecisions = new Map();
    this.approvalTimeoutMs = approvalTimeoutMs;

    this.logger.info("bfis-approval-manager-initialized", {
      approvalTimeoutMs: this.approvalTimeoutMs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Store a decision for human approval.
   *
   * Generates a unique decision ID and sets expiration time based on configured timeout.
   *
   * @param decision - BFIS decision to store for approval
   * @param sessionId - Session ID this decision belongs to
   * @returns Decision ID for tracking
   */
  async proposeDecision(decision: BfisDecision, sessionId: string): Promise<string> {
    const decisionId = uuidv4();
    const proposedAt = new Date();
    const expiresAt = new Date(proposedAt.getTime() + this.approvalTimeoutMs);

    const pendingDecision: PendingDecision = {
      decisionId,
      sessionId,
      decision,
      proposedAt: proposedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
    };

    this.pendingDecisions.set(decisionId, pendingDecision);

    this.logger.info("bfis-decision-proposed", {
      decisionId,
      sessionId,
      actionCount: decision.actions.length,
      actionTypes: decision.actions.map((a) => a.type),
      expiresAt: expiresAt.toISOString(),
      timestamp: proposedAt.toISOString(),
    });

    return decisionId;
  }

  /**
   * Process human approval or rejection of a decision.
   *
   * Updates decision status and returns the pending decision for execution.
   * Throws error if decision not found, already processed, or expired.
   *
   * @param decisionId - Decision ID to approve/reject
   * @param approved - Whether to approve (true) or reject (false)
   * @returns Pending decision with updated status
   * @throws Error if decision not found, already processed, or expired
   */
  async processApproval(decisionId: string, approved: boolean): Promise<PendingDecision> {
    const pending = this.pendingDecisions.get(decisionId);

    if (!pending) {
      this.logger.error("bfis-approval-decision-not-found", {
        decisionId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Decision not found: ${decisionId}`);
    }

    // Check if already processed
    if (pending.status !== "pending") {
      this.logger.error("bfis-approval-already-processed", {
        decisionId,
        currentStatus: pending.status,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Decision already processed: ${pending.status}`);
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(pending.expiresAt);
    if (now > expiresAt) {
      pending.status = "expired";
      this.logger.warn("bfis-approval-expired", {
        decisionId,
        expiresAt: pending.expiresAt,
        timestamp: now.toISOString(),
      });
      throw new Error(`Decision expired at ${pending.expiresAt}`);
    }

    // Update status
    pending.status = approved ? "approved" : "rejected";

    this.logger.info("bfis-approval-processed", {
      decisionId,
      sessionId: pending.sessionId,
      approved,
      actionCount: pending.decision.actions.length,
      timestamp: now.toISOString(),
    });

    return pending;
  }

  /**
   * Get a pending decision by ID.
   *
   * @param decisionId - Decision ID to retrieve
   * @returns Pending decision or undefined if not found
   */
  getPendingDecision(decisionId: string): PendingDecision | undefined {
    return this.pendingDecisions.get(decisionId);
  }

  /**
   * Get all pending decisions for a session.
   *
   * @param sessionId - Session ID to filter by
   * @returns Array of pending decisions for the session
   */
  getPendingDecisionsForSession(sessionId: string): PendingDecision[] {
    return Array.from(this.pendingDecisions.values()).filter(
      (d) => d.sessionId === sessionId && d.status === "pending"
    );
  }

  /**
   * Clean up expired decisions.
   *
   * Marks expired decisions as "expired" and logs cleanup events.
   * Should be called periodically to prevent memory leaks.
   *
   * @returns Number of decisions expired
   */
  cleanupExpiredDecisions(): number {
    const now = new Date();
    let expiredCount = 0;

    for (const [decisionId, pending] of this.pendingDecisions.entries()) {
      if (pending.status === "pending") {
        const expiresAt = new Date(pending.expiresAt);
        if (now > expiresAt) {
          pending.status = "expired";
          expiredCount++;

          this.logger.info("bfis-decision-expired", {
            decisionId,
            sessionId: pending.sessionId,
            expiresAt: pending.expiresAt,
            timestamp: now.toISOString(),
          });
        }
      }
    }

    if (expiredCount > 0) {
      this.logger.info("bfis-approval-cleanup", {
        expiredCount,
        totalDecisions: this.pendingDecisions.size,
        timestamp: now.toISOString(),
      });
    }

    return expiredCount;
  }

  /**
   * Remove a decision from tracking (after execution or rejection).
   *
   * @param decisionId - Decision ID to remove
   */
  removeDecision(decisionId: string): void {
    this.pendingDecisions.delete(decisionId);
  }

  /**
   * Get total number of pending decisions across all sessions.
   *
   * @returns Total pending decision count
   */
  getPendingCount(): number {
    return Array.from(this.pendingDecisions.values()).filter((d) => d.status === "pending").length;
  }
}
