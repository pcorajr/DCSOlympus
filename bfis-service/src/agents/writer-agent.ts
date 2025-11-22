/**
 * Writer agent: Translates decisions into executable Olympus commands.
 *
 * Maps high-level BfisAction types to concrete Olympus command formats,
 * validates parameters, and executes or logs commands based on configuration.
 *
 * Per spec-004: Writer agent = Command Translator
 * - Consumes Commander decisions (BfisDecision)
 * - Maps BfisAction to Olympus command formats
 * - Executes commands via PUT /olympus (async pattern)
 * - Tracks command hashes and status
 *
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/architecture/spec-004.md | spec-004.md}
 * @see {@link https://github.com/dcs-olympus/DCSOlympus/blob/main/docs/integration/bfis/bfis_olympus_command_flow.md | Command Flow}
 */

import type { WriterAgentInput, CommandResult } from "./types.js";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { BfisAction } from "../../../shared-schemas/index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Writer agent: Translates decisions into executable Olympus commands.
 *
 * Maps high-level BfisAction types to concrete Olympus command formats,
 * validates parameters, and executes or logs commands based on configuration.
 */
export class WriterAgent {
  private readonly executionMode: "log" | "execute";
  private readonly enableValidation: boolean;

  constructor(
    private readonly config: BfisConfig,
    private readonly logger: StructuredLogger
  ) {
    this.executionMode = config.agents?.writer.commandExecutionMode ?? "log";
    this.enableValidation = config.agents?.writer.enableCommandValidation ?? true;
  }

  /**
   * Translate decision actions into Olympus commands and execute or log them.
   *
   * @param input - Writer agent input (decision + available commands)
   * @returns Array of command results, one per action
   */
  async executeCommands(input: WriterAgentInput): Promise<CommandResult[]> {
    const startTime = Date.now();
    const decisionId = input.decision.decisionId;
    const actionCount = input.decision.actions.length;

    this.logger.debug("bfis-writer-execute-start", {
      decisionId,
      actionCount,
      executionMode: this.executionMode,
      timestamp: new Date().toISOString(),
    });

    const results: CommandResult[] = [];

    for (let i = 0; i < input.decision.actions.length; i++) {
      const actionStartTime = Date.now();
      const action = input.decision.actions[i];
      
      this.logger.debug("bfis-writer-action-start", {
        decisionId,
        actionIndex: i,
        actionType: action.type,
        timestamp: new Date().toISOString(),
      });

      try {
        // Map action to command
        const command = this.mapActionToCommand(action, input.availableCommands);

        if (!command) {
          this.logger.warn("bfis-writer-unknown-action", {
            decisionId: input.decision.decisionId,
            actionIndex: i,
            actionType: action.type,
          });
          results.push({
            commandHash: uuidv4(),
            status: "FAILED",
            error: `Unknown action type: ${action.type}`,
          });
          this.logger.debug("bfis-writer-action-complete", {
            decisionId,
            actionIndex: i,
            actionType: action.type,
            status: "FAILED",
            durationMs: Date.now() - actionStartTime,
          });
          continue; // Skip unknown actions
        }

        // Validate command parameters
        if (this.enableValidation) {
          const validationError = this.validateCommand(command, action);
          if (validationError) {
            this.logger.error("bfis-writer-validation-error", {
              decisionId: input.decision.decisionId,
              actionIndex: i,
              actionType: action.type,
              error: validationError,
            });
            results.push({
              commandHash: uuidv4(),
              status: "FAILED",
              error: validationError,
            });
            this.logger.debug("bfis-writer-action-complete", {
              decisionId,
              actionIndex: i,
              actionType: action.type,
              status: "FAILED",
              durationMs: Date.now() - actionStartTime,
            });
            continue;
          }
        }

        // Execute or log command
        const commandStartTime = Date.now();
        const result = await this.executeOrLogCommand(command, action);
        const commandDuration = Date.now() - commandStartTime;
        results.push(result);

        this.logger.info("bfis-writer-command-mapped", {
          decisionId: input.decision.decisionId,
          actionIndex: i,
          actionType: action.type,
          commandName: command.name,
          commandHash: result.commandHash,
          status: result.status,
          durationMs: commandDuration,
        });
        
        this.logger.debug("bfis-writer-action-complete", {
          decisionId,
          actionIndex: i,
          actionType: action.type,
          status: result.status,
          durationMs: Date.now() - actionStartTime,
        });
      } catch (error) {
        this.logger.error("bfis-writer-command-error", {
          decisionId: input.decision.decisionId,
          actionIndex: i,
          actionType: action.type,
          error: error instanceof Error ? error.message : String(error),
        });

        results.push({
          commandHash: uuidv4(),
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const successfulCount = results.filter(r => r.status === "SENT" || r.status === "CONFIRMED" || r.status === "LOGGED").length;
    const failedCount = results.filter(r => r.status === "FAILED").length;
    
    this.logger.debug("bfis-writer-execute-complete", {
      decisionId,
      totalActions: actionCount,
      successfulCommands: successfulCount,
      failedCommands: failedCount,
      totalDurationMs: totalDuration,
      averageDurationMs: actionCount > 0 ? (totalDuration / actionCount).toFixed(1) : "0.0",
      timestamp: new Date().toISOString(),
    });

    return results;
  }

  /**
   * Map BfisAction to Olympus command format.
   *
   * @param action - BFIS action to map
   * @param availableCommands - List of available command names
   * @returns Command object or null if action type unknown
   */
  private mapActionToCommand(
    action: BfisAction,
    availableCommands: string[]
  ): { name: string; params: Record<string, unknown> } | null {
    switch (action.type) {
      case "SPAWN":
        // Determine spawn command based on unit category or type
        const unitType = action.params?.unitType || "";
        const category = action.params?.category || "";
        
        if (category === "Helicopter" || unitType.toLowerCase().includes("helicopter")) {
          if (availableCommands.includes("spawnHelicopters")) {
            return { name: "spawnHelicopters", params: this.buildSpawnParams(action) };
          }
        }
        if (availableCommands.includes("spawnAircrafts")) {
          return { name: "spawnAircrafts", params: this.buildSpawnParams(action) };
        }
        // Fallback to generic spawn if available
        if (availableCommands.includes("spawnUnits")) {
          return { name: "spawnUnits", params: this.buildSpawnParams(action) };
        }
        return null;

      case "MOVE":
        if (action.params?.destinationType === "airbase" && availableCommands.includes("landAt")) {
          return { name: "landAt", params: this.buildMoveParams(action) };
        }
        if (availableCommands.includes("setPath")) {
          return { name: "setPath", params: this.buildMoveParams(action) };
        }
        if (availableCommands.includes("setGroupRoute")) {
          return { name: "setGroupRoute", params: this.buildMoveParams(action) };
        }
        return null;

      case "ATTACK":
        if (action.target?.unitId && availableCommands.includes("attackUnit")) {
          return { name: "attackUnit", params: this.buildAttackParams(action) };
        }
        if (action.target?.coordinateRef && availableCommands.includes("bombPoint")) {
          return { name: "bombPoint", params: this.buildAttackParams(action) };
        }
        return null;

      case "RTB":
        if (availableCommands.includes("returnToBase")) {
          return { name: "returnToBase", params: this.buildRtbParams(action) };
        }
        if (availableCommands.includes("landAt")) {
          return { name: "landAt", params: this.buildRtbParams(action) };
        }
        return null;

      case "HOLD":
        if (availableCommands.includes("holdPosition")) {
          return { name: "holdPosition", params: this.buildHoldParams(action) };
        }
        return null;

      default:
        return null; // Unknown action type
    }
  }

  /**
   * Build spawn command parameters from action.
   */
  private buildSpawnParams(action: BfisAction): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (action.params?.unitType) {
      params.unitType = action.params.unitType;
    }
    if (action.params?.count !== undefined) {
      params.count = action.params.count;
    }
    if (action.target?.coordinateRef) {
      params.position = action.target.coordinateRef;
    }
    if (action.params?.coalition) {
      params.coalition = action.params.coalition;
    }
    if (action.params?.airbaseName) {
      params.airbaseName = action.params.airbaseName;
    }
    if (action.params?.country) {
      params.country = action.params.country;
    }
    if (action.params?.immediate !== undefined) {
      params.immediate = action.params.immediate;
    }

    return params;
  }

  /**
   * Build move command parameters from action.
   */
  private buildMoveParams(action: BfisAction): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (action.target?.unitId) {
      params.ID = action.target.unitId;
    }
    if (action.target?.groupId) {
      params.groupId = action.target.groupId;
    }
    if (action.target?.coordinateRef) {
      params.path = [action.target.coordinateRef];
    }
    if (action.params?.waypointId) {
      params.waypointId = action.params.waypointId;
    }
    if (action.params?.speedKts) {
      params.speed = action.params.speedKts;
    }
    if (action.params?.altitudeMeters) {
      params.altitude = action.params.altitudeMeters;
    }

    return params;
  }

  /**
   * Build attack command parameters from action.
   */
  private buildAttackParams(action: BfisAction): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (action.target?.unitId) {
      params.targetId = action.target.unitId;
    }
    if (action.target?.coordinateRef) {
      params.position = action.target.coordinateRef;
    }
    if (action.params?.weaponType) {
      params.weaponType = action.params.weaponType;
    }

    return params;
  }

  /**
   * Build RTB command parameters from action.
   */
  private buildRtbParams(action: BfisAction): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (action.target?.unitId) {
      params.ID = action.target.unitId;
    }
    if (action.target?.groupId) {
      params.groupId = action.target.groupId;
    }
    if (action.target?.coordinateRef) {
      params.position = action.target.coordinateRef;
    }
    if (action.params?.airbaseName) {
      params.airbaseName = action.params.airbaseName;
    }

    return params;
  }

  /**
   * Build hold command parameters from action.
   */
  private buildHoldParams(action: BfisAction): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (action.target?.unitId) {
      params.ID = action.target.unitId;
    }
    if (action.target?.groupId) {
      params.groupId = action.target.groupId;
    }

    return params;
  }

  /**
   * Validate command parameters.
   *
   * @param command - Command to validate
   * @param action - Original action
   * @returns Error message if validation fails, null otherwise
   */
  private validateCommand(
    command: { name: string; params: Record<string, unknown> },
    action: BfisAction
  ): string | null {
    // Basic validation: ensure required fields are present
    switch (command.name) {
      case "spawnAircrafts":
      case "spawnHelicopters":
        if (!command.params.unitType && !command.params.position) {
          return "Spawn command requires unitType or position";
        }
        break;

      case "setPath":
      case "setGroupRoute":
        if (!command.params.ID && !command.params.groupId) {
          return "Move command requires unitId or groupId";
        }
        if (!command.params.path && !action.target?.coordinateRef) {
          return "Move command requires path or coordinateRef";
        }
        break;

      case "attackUnit":
        if (!command.params.targetId) {
          return "Attack command requires targetId";
        }
        break;

      case "bombPoint":
        if (!command.params.position) {
          return "BombPoint command requires position";
        }
        break;
    }

    return null;
  }

  /**
   * Execute or log command based on configuration.
   *
   * @param command - Command to execute or log
   * @param action - Original action for context
   * @returns Command result with hash and status
   */
  private async executeOrLogCommand(
    command: { name: string; params: Record<string, unknown> },
    action: BfisAction
  ): Promise<CommandResult> {
    if (this.executionMode === "log") {
      // Log mode: generate a hash but don't send to Olympus
      const commandHash = `log-${uuidv4()}`;
      
      this.logger.info("bfis-writer-command-logged", {
        commandName: command.name,
        commandParams: command.params,
        actionType: action.type,
        commandHash,
      });

      return {
        commandHash,
        status: "LOGGED",
      };
    }

    // Execute mode: send command to Olympus
    return await this.sendCommandToOlympus(command);
  }

  /**
   * Send command to Olympus via PUT /olympus.
   *
   * @param command - Command to send
   * @returns Command result with hash and status
   */
  private async sendCommandToOlympus(
    command: { name: string; params: Record<string, unknown> }
  ): Promise<CommandResult> {
    const { olympusBaseUrl, olympusAuth } = this.config;

    // Normalize URL to remove trailing slashes
    const base = olympusBaseUrl.replace(/\/+$/, "");
    const url = `${base}`;

    const username = olympusAuth.username;
    const password = olympusAuth.password;
    
    // Convert role to command mode header
    const commandMode = this.roleToCommandMode(olympusAuth.role);
    
    // Basic auth: base64 encode username:password
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    // Build command payload: top-level key is command name
    const payload: Record<string, Record<string, unknown>> = {
      [command.name]: command.params,
    };

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${basic}`,
          "X-Command-Mode": commandMode,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Olympus command failed: ${response.status} ${response.statusText} ${errorText}`);
      }

      const result = (await response.json()) as { commandHash?: string };
      const commandHash = result.commandHash || uuidv4();

      return {
        commandHash,
        status: "SENT",
      };
    } catch (error) {
      throw new Error(
        `Failed to send command to Olympus: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Convert role to command mode header value.
   *
   * @param role - Olympus role
   * @returns Command mode header value
   */
  private roleToCommandMode(role: string): string {
    switch (role.toLowerCase()) {
      case "game master":
      case "gamemaster":
        return "Game master";
      case "blue commander":
      case "bluecommander":
        return "Blue commander";
      case "red commander":
      case "redcommander":
        return "Red commander";
      default:
        return "Game master"; // Default fallback
    }
  }
}
