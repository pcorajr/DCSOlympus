/**
 * HTTP server for BFIS chat interface endpoints.
 *
 * Provides REST API endpoints for human-in-the-loop Copilot mode:
 * - POST /bfis/chat/message - Send message to Dialogue Manager
 * - POST /bfis/chat/approve - Approve or reject proposed actions
 * - GET /bfis/chat/history - Retrieve conversation history
 *
 * Per Spec-005: Transform BFIS from autonomous polling to chat-based interaction.
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/specs/005-bfis-chat-interface.md | Spec-005}
 */

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { DialogueManager } from "./dialogue-manager.js";
import type {
  ChatMessageRequest,
  ChatMessageResponse,
  ChatApprovalRequest,
  ChatApprovalResponse,
  ChatHistoryResponse,
} from "./types.js";

/**
 * Create and configure Express HTTP server for BFIS chat interface.
 *
 * @param config - BFIS configuration
 * @param logger - Structured logger
 * @param dialogueManager - Dialogue manager instance
 * @returns Configured Express application
 */
export function createChatServer(
  config: BfisConfig,
  logger: StructuredLogger,
  dialogueManager: DialogueManager
): express.Application {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug("bfis-http-request", {
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
    });
    next();
  });

  /**
   * POST /bfis/chat/message
   *
   * Send a message to the Dialogue Manager and receive a response.
   * The LLM may propose actions that require explicit human approval.
   */
  app.post("/bfis/chat/message", async (req: Request, res: Response) => {
    try {
      const body = req.body as ChatMessageRequest;

      // Validate request
      if (!body.message || typeof body.message !== "string") {
        logger.warn("bfis-chat-invalid-request", {
          error: "Missing or invalid message field",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid message field",
        });
      }

      if (!body.sessionId || typeof body.sessionId !== "string") {
        logger.warn("bfis-chat-invalid-request", {
          error: "Missing or invalid sessionId field",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid sessionId field",
        });
      }

      // Process message via Dialogue Manager
      const response = await dialogueManager.processMessage({
        message: body.message,
        sessionId: body.sessionId,
        sessionHash: body.sessionHash || "default",
      });

      // Build response
      const chatResponse: ChatMessageResponse = {
        response: response.response,
        proposedActions: response.proposedDecision?.decision,
        decisionId: response.proposedDecision?.decisionId,
        requiresApproval: !!response.proposedDecision,
      };

      logger.info("bfis-chat-message-processed", {
        sessionId: body.sessionId,
        hasProposal: !!response.proposedDecision,
        timestamp: new Date().toISOString(),
      });

      res.json(chatResponse);
    } catch (error) {
      logger.error("bfis-chat-message-error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        error: "Internal server error processing message",
      });
    }
  });

  /**
   * POST /bfis/chat/approve
   *
   * Approve or reject a proposed decision.
   * If approved, the actions are executed via the Writer agent.
   */
  app.post("/bfis/chat/approve", async (req: Request, res: Response) => {
    try {
      const body = req.body as ChatApprovalRequest;

      // Validate request
      if (!body.sessionId || typeof body.sessionId !== "string") {
        logger.warn("bfis-chat-invalid-approval", {
          error: "Missing or invalid sessionId field",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid sessionId field",
        });
      }

      if (!body.decisionId || typeof body.decisionId !== "string") {
        logger.warn("bfis-chat-invalid-approval", {
          error: "Missing or invalid decisionId field",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid decisionId field",
        });
      }

      if (typeof body.approved !== "boolean") {
        logger.warn("bfis-chat-invalid-approval", {
          error: "Missing or invalid approved field",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid approved field",
        });
      }

      // Process approval via Dialogue Manager
      const result = await dialogueManager.executeApprovedActions({
        sessionId: body.sessionId,
        decisionId: body.decisionId,
        approved: body.approved,
      });

      // Build response
      const approvalResponse: ChatApprovalResponse = {
        decisionId: result.decisionId,
        approved: result.approved,
        executionResults: result.commandResults,
        error: result.error,
      };

      logger.info("bfis-chat-approval-processed", {
        sessionId: body.sessionId,
        decisionId: body.decisionId,
        approved: body.approved,
        timestamp: new Date().toISOString(),
      });

      res.json(approvalResponse);
    } catch (error) {
      logger.error("bfis-chat-approval-error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        error: "Internal server error processing approval",
      });
    }
  });

  /**
   * GET /bfis/chat/history
   *
   * Retrieve conversation history for a session.
   */
  app.get("/bfis/chat/history", (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string;
      const limitStr = req.query.limit as string | undefined;

      // Validate request
      if (!sessionId || typeof sessionId !== "string") {
        logger.warn("bfis-chat-invalid-history-request", {
          error: "Missing or invalid sessionId parameter",
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          error: "Missing or invalid sessionId parameter",
        });
      }

      const limit = limitStr ? parseInt(limitStr, 10) : undefined;

      // Get history from Dialogue Manager
      const messages = dialogueManager.getConversationHistory(sessionId, limit);

      // Build response
      const historyResponse: ChatHistoryResponse = {
        sessionId,
        messages,
        totalMessages: messages.length,
      };

      logger.info("bfis-chat-history-retrieved", {
        sessionId,
        messageCount: messages.length,
        timestamp: new Date().toISOString(),
      });

      res.json(historyResponse);
    } catch (error) {
      logger.error("bfis-chat-history-error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        error: "Internal server error retrieving history",
      });
    }
  });

  /**
   * GET /bfis/health
   *
   * Health check endpoint for monitoring.
   */
  app.get("/bfis/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "bfis-chat-interface",
      version: config.bfisVersion,
      timestamp: new Date().toISOString(),
    });
  });

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error("bfis-http-error", {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      error: "Internal server error",
    });
  });

  return app;
}

/**
 * Start HTTP server on configured port.
 *
 * @param app - Express application
 * @param config - BFIS configuration
 * @param logger - Structured logger
 * @returns Promise that resolves when server is listening
 */
export function startChatServer(
  app: express.Application,
  config: BfisConfig,
  logger: StructuredLogger
): Promise<void> {
  return new Promise((resolve) => {
    const port = config.chat?.port ?? 4513;

    app.listen(port, () => {
      logger.info("bfis-http-server-started", {
        port,
        timestamp: new Date().toISOString(),
      });
      resolve();
    });
  });
}
