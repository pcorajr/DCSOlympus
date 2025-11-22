/**
 * Configuration management for BFIS service.
 *
 * Per spec: Loads configuration from environment variables with sane defaults.
 *
 * Configuration includes:
 * - Olympus URL and authentication (Game Master credentials by default)
 * - Polling intervals (units/weapons/logs/mission/airbases/bullseyes/spots)
 * - LLM configuration (provider, baseUrl, model, etc.)
 * - Log path for NDJSON decision logs
 * - BFIS version and log level flags
 *
 * Env sources (in order of precedence):
 * 1. Process environment (BFIS_* and OLYMPUS_* variables)
 * 2. Optional dotenv file (.env) in bfis-service root
 * 3. Optional creds file at /home/dcs/.creds/olympus_env.txt (for local dev)
 *
 * This module centralizes all configuration loading to ensure consistent behavior
 * across the service and provides type-safe access to configuration values.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// In ESM/NodeNext, __dirname is not defined; derive it from import.meta.url.
// This allows us to resolve relative paths for .env files and package.json
const THIS_DIR = path.dirname(new URL(import.meta.url).pathname);

/**
 * Olympus authentication roles supported by BFIS.
 *
 * Each role has different permissions and command capabilities in Olympus.
 * BFIS defaults to GAME_MASTER for full control, but can operate as BLUE_COMMANDER
 * or RED_COMMANDER for coalition-restricted modes (post-MVP feature).
 */
export type OlympusRole = "GAME_MASTER" | "BLUE_COMMANDER" | "RED_COMMANDER" | "ADMIN";

/**
 * Olympus authentication configuration.
 *
 * Contains the credentials and role BFIS uses to authenticate with Olympus.
 * Credentials are loaded from environment variables or credential files.
 */
export interface OlympusAuthConfig {
  role: OlympusRole;
  username: string;
  password: string;
}

/**
 * Polling interval configuration in milliseconds.
 *
 * These intervals control how frequently BFIS polls different Olympus endpoints.
 * Conservative defaults are used to avoid adding load to the Olympus server.
 * Per spec: units/weapons 1000ms, logs 1000ms, mission/airbases/etc 5000-10000ms.
 */
export interface PollingConfig {
  unitsMs: number;
  weaponsMs: number;
  logsMs: number;
  missionMs: number;
  airbasesMs: number;
  bullseyesMs: number;
  spotsMs: number;
  /** Minimum interval between decision cycles (ms). Prevents LLM from being hammered by constant polling. */
  decisionCycleIntervalMs: number;
  /** Enable background polling for snapshot data. Default: true */
  enabled: boolean;
  /** Trigger orchestrator automatically on each snapshot poll. Default: false (Spec-005: human-in-the-loop) */
  triggerOrchestrator: boolean;
}

/**
 * LLM configuration for decision-making.
 *
 * MVP supports Ollama/LLMstudio (local LLM) via HTTP API.
 * Future: extensible to cloud-based LLMs (OpenAI, Anthropic, etc.).
 * If provider is "none", BFIS operates in rules-based mode only.
 */
export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
}

/**
 * Agent-specific configuration for multi-agent LLM architecture.
 *
 * Extends base BfisConfig with agent-specific settings for Intel, Commander, Writer, and Orchestrator.
 */
export interface AgentConfig {
  intel: {
    pollingIntervalMs: number; // Default: 2000
    enableChangeDetection: boolean; // Default: true
    positionChangeThresholdMeters: number; // Default: 1000
    maxTokens: number; // Default: 2000
    temperature: number; // Default: 0.3
  };
  commander: {
    maxTokens: number; // Default: 4000
    temperature: number; // Default: 0.7
    enableRulesFallback: boolean; // Default: true
    maxActionsPerDecision: number; // Default: 10
  };
  writer: {
    maxTokens: number; // Default: 2000
    temperature: number; // Default: 0.2
    enableCommandValidation: boolean; // Default: true
    commandExecutionMode: "log" | "execute"; // Default: "log"
  };
  orchestrator: {
    enableCheckpointing: boolean; // Default: false
    maxCycles: number; // Default: 10
    cycleTimeoutMs: number; // Default: 30000
  };
}

/**
 * Complete BFIS service configuration.
 *
 * This is the single source of truth for all runtime configuration.
 * All configuration is loaded once at startup and remains immutable.
 */
export interface BfisConfig {
  bfisVersion: string;
  logLevel: "debug" | "info" | "warn" | "error";
  /** General structured log file for service events. */
  generalLogPath: string;
  olympusFrontendBaseUrl: string;
  olympusBaseUrl: string;
  olympusAuth: OlympusAuthConfig;
  polling: PollingConfig;
  ndjsonLogPath: string;
  llm: LlmConfig;
  /** Agent-specific configuration for multi-agent LLM architecture. */
  agents?: AgentConfig;
}

/**
 * Load environment variables from a simple key=value file.
 *
 * This is a lightweight parser for credential files that don't use dotenv format.
 * Used primarily for /home/dcs/.creds/olympus_env.txt in local development.
 *
 * @param envPath - Path to the environment file
 */
function loadEnvFileIfPresent(envPath: string): void {
  /**
   * Load simple KEY=VALUE pairs from a file into process.env if the file exists.
   * Existing environment variables are not overridden.
   *
   * This is used to ingest `/home/dcs/.creds/olympus_env.txt` in the home setup.
   */
  try {
    if (fs.existsSync(envPath)) {
      const contents = fs.readFileSync(envPath, "utf-8");
      // Parse line-by-line, skipping comments and empty lines
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex <= 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Only set if not already in process.env (respect precedence)
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Fail silently; config loading will surface missing values if critical.
    // This allows the service to start even if credential files are missing or malformed.
  }
}

/**
 * Load environment variables from multiple sources in precedence order.
 *
 * Sources are loaded in order, with later sources not overriding earlier ones.
 * This allows credential files to provide defaults that can be overridden by
 * environment variables or .env files.
 */
function loadEnv(): void {
  // 1) Primary source: local Olympus creds file for this workspace.
  //    This is the main way BFIS is configured on the home rig.
  loadEnvFileIfPresent("/home/dcs/.creds/olympus_env.txt");

  // 2) Load standard .env for bfis-service if present (optional overrides)
  const localEnvPath = path.resolve(THIS_DIR, "..", "..", ".env");
  dotenv.config({ path: localEnvPath, override: false });

  // 3) Load shared/root .env if present (optional overrides)
  const rootEnvPath = path.resolve(THIS_DIR, "..", "..", "..", ".env");
  dotenv.config({ path: rootEnvPath, override: false });
}

/**
 * Detect BFIS version from package.json.
 *
 * Falls back to "0.0.0-dev" if package.json cannot be read or parsed.
 * This allows the service to run even if package.json is missing or malformed.
 */
function detectBfisVersion(): string {
  try {
    const pkgPath = path.resolve(THIS_DIR, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

/**
 * Normalize log level string to a valid log level.
 *
 * Ensures only valid log levels are used, defaulting to "info" for invalid values.
 * This prevents runtime errors from invalid configuration.
 *
 * @param level - Raw log level string from environment
 * @returns Valid log level or "info" as default
 */
function normalizeLogLevel(level: string | undefined): "debug" | "info" | "warn" | "error" {
  const normalized = (level ?? "info").toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "info";
}

/**
 * Resolve Olympus base URLs from environment variables.
 *
 * Handles the relationship between frontend URL (where React/Express server runs)
 * and the Olympus API endpoint (which may be proxied through the frontend).
 *
 * @returns Object containing both frontend and Olympus API base URLs
 */
function resolveOlympusBaseUrls(): { frontendBaseUrl: string; olympusBaseUrl: string } {
  // Frontend base URL (where the React/Express server is listening)
  const frontendBaseUrl = process.env.OLYMPUS_BASE_URL ?? "http://localhost:3000";

  // BFIS-specific Olympus base URL; if not set, derive from OLYMPUS_BASE_URL
  let olympusBaseUrl = process.env.BFIS_OLYMPUS_BASE_URL;
  if (!olympusBaseUrl) {
    // Default: append /olympus to the frontend base URL if not already present
    // This handles the common case where Olympus API is proxied through the frontend server
    if (frontendBaseUrl.endsWith("/olympus")) {
      olympusBaseUrl = frontendBaseUrl;
    } else {
      olympusBaseUrl = `${frontendBaseUrl.replace(/\/+$/, "")}/olympus`;
    }
  }

  return {
    frontendBaseUrl,
    olympusBaseUrl,
  };
}

/**
 * Resolve Olympus authentication configuration.
 *
 * Supports role-based authentication with fallback to role-specific environment variables.
 * Throws an error if credentials cannot be resolved, as authentication is required.
 *
 * @returns Olympus authentication configuration
 * @throws Error if credentials cannot be resolved
 */
function resolveOlympusAuth(): OlympusAuthConfig {
  const roleEnv = (process.env.BFIS_OLYMPUS_ROLE ?? "GAME_MASTER").toUpperCase();
  let role: OlympusRole = "GAME_MASTER";
  if (roleEnv === "BLUE_COMMANDER") role = "BLUE_COMMANDER";
  else if (roleEnv === "RED_COMMANDER") role = "RED_COMMANDER";
  else if (roleEnv === "ADMIN") role = "ADMIN";

  // Default to Game master creds if BFIS-specific values are not provided
  // This allows BFIS to use the same credentials as the main Olympus setup
  let username = process.env.BFIS_OLYMPUS_USERNAME;
  let password = process.env.BFIS_OLYMPUS_PASSWORD;

  if (!username || !password) {
    // Fallback to role-specific environment variables
    if (role === "GAME_MASTER") {
      username = process.env.OLYMPUS_GAME_MASTER_USERNAME;
      password = process.env.OLYMPUS_GAME_MASTER_PASSWORD;
    } else if (role === "BLUE_COMMANDER") {
      username = process.env.OLYMPUS_BLUE_COMMANDER_USERNAME;
      password = process.env.OLYMPUS_BLUE_COMMANDER_PASSWORD;
    } else if (role === "RED_COMMANDER") {
      username = process.env.OLYMPUS_RED_COMMANDER_USERNAME;
      password = process.env.OLYMPUS_RED_COMMANDER_PASSWORD;
    } else if (role === "ADMIN") {
      username = process.env.OLYMPUS_ADMIN_USERNAME;
      password = process.env.OLYMPUS_ADMIN_PASSWORD;
    }
  }

  if (!username || !password) {
    throw new Error(
      "Missing Olympus credentials. Ensure /home/dcs/.creds/olympus_env.txt exists or BFIS_OLYMPUS_USERNAME/BFIS_OLYMPUS_PASSWORD or OLYMPUS_* vars are set."
    );
  }

  return {
    role,
    username,
    password,
  };
}

/**
 * Resolve polling interval configuration.
 *
 * Uses environment variables with defaults from the BFIS spec.
 * Defaults are conservative to avoid adding load to the Olympus server.
 *
 * Per Spec-005: Default to human-in-the-loop mode (triggerOrchestrator=false)
 * to prevent autonomous "action-happy" behavior. Polling continues for Intel
 * tool queries, but orchestrator is not triggered automatically.
 *
 * @returns Polling configuration with intervals in milliseconds
 */
function resolvePollingConfig(): PollingConfig {
  // Defaults based on MVP spec
  return {
    unitsMs: Number(process.env.BFIS_POLL_UNITS_MS ?? 1000),
    weaponsMs: Number(process.env.BFIS_POLL_WEAPONS_MS ?? 1000),
    logsMs: Number(process.env.BFIS_POLL_LOGS_MS ?? 1000),
    missionMs: Number(process.env.BFIS_POLL_MISSION_MS ?? 5000),
    airbasesMs: Number(process.env.BFIS_POLL_AIRBASES_MS ?? 10000),
    bullseyesMs: Number(process.env.BFIS_POLL_BULLSEYES_MS ?? 10000),
    spotsMs: Number(process.env.BFIS_POLL_SPOTS_MS ?? 2000),
    decisionCycleIntervalMs: Number(process.env.BFIS_DECISION_CYCLE_INTERVAL_MS ?? 10000), // 10 seconds default
    // Spec-005: Human-in-the-loop by default (no autonomous decisions)
    enabled: process.env.BFIS_POLLING_ENABLED !== "false", // Default: true (keep polling for Intel)
    triggerOrchestrator: process.env.BFIS_TRIGGER_ORCHESTRATOR === "true", // Default: false (Spec-005)
  };
}

/**
 * Resolve LLM configuration.
 *
 * If provider is "none", BFIS operates in rules-based mode only.
 * Empty strings for baseUrl/model indicate LLM is not configured.
 *
 * Defaults to LLMstudio instance at http://192.168.1.2:1234/v1 with gpt-oss:20b model.
 * Can be overridden via environment variables.
 *
 * @returns LLM configuration
 */
function resolveLlmConfig(): LlmConfig {
  return {
    provider: process.env.BFIS_LLM_PROVIDER ?? "llmstudio",
    baseUrl: process.env.BFIS_LLM_BASE_URL ?? "http://192.168.1.2:1234",
    model: process.env.BFIS_LLM_MODEL ?? "openai/gpt-oss-20b",
  };
}

/**
 * Resolve agent configuration with defaults.
 *
 * @returns Agent configuration with all defaults applied
 */
function resolveAgentConfig(): AgentConfig {
  return {
    intel: {
      pollingIntervalMs: Number(process.env.BFIS_AGENT_INTEL_POLLING_MS ?? 2000),
      enableChangeDetection: process.env.BFIS_AGENT_INTEL_CHANGE_DETECTION !== "false",
      positionChangeThresholdMeters: Number(process.env.BFIS_AGENT_INTEL_POSITION_THRESHOLD_M ?? 1000),
      maxTokens: Number(process.env.BFIS_AGENT_INTEL_MAX_TOKENS ?? 2000),
      temperature: Number(process.env.BFIS_AGENT_INTEL_TEMPERATURE ?? 0.3),
    },
    commander: {
      maxTokens: Number(process.env.BFIS_AGENT_COMMANDER_MAX_TOKENS ?? 4000),
      temperature: Number(process.env.BFIS_AGENT_COMMANDER_TEMPERATURE ?? 0.7),
      enableRulesFallback: process.env.BFIS_AGENT_COMMANDER_RULES_FALLBACK !== "false",
      maxActionsPerDecision: Number(process.env.BFIS_AGENT_COMMANDER_MAX_ACTIONS ?? 10),
    },
    writer: {
      maxTokens: Number(process.env.BFIS_AGENT_WRITER_MAX_TOKENS ?? 2000),
      temperature: Number(process.env.BFIS_AGENT_WRITER_TEMPERATURE ?? 0.2),
      enableCommandValidation: process.env.BFIS_AGENT_WRITER_VALIDATION !== "false",
      commandExecutionMode: (process.env.BFIS_COMMAND_EXECUTION_MODE ?? "log") as "log" | "execute",
    },
    orchestrator: {
      enableCheckpointing: process.env.BFIS_ORCHESTRATOR_CHECKPOINTING === "true",
      maxCycles: Number(process.env.BFIS_ORCHESTRATOR_MAX_CYCLES ?? 10),
      cycleTimeoutMs: Number(process.env.BFIS_ORCHESTRATOR_TIMEOUT_MS ?? 30000),
    },
  };
}

/**
 * Load and return the full BFIS configuration.
 *
 * This function is safe to call multiple times; environment loading happens once
 * and reads from:
 * - .env files (bfis-service and repo root)
 * - Optional /home/dcs/.creds/olympus_env.txt (local dev helper)
 * - Process environment variables (highest precedence)
 *
 * @returns Complete BFIS configuration object
 * @throws Error if required configuration (e.g., credentials) cannot be resolved
 */
export function loadConfig(): BfisConfig {
  loadEnv();

  const { frontendBaseUrl, olympusBaseUrl } = resolveOlympusBaseUrls();

  return {
    bfisVersion: process.env.BFIS_VERSION ?? detectBfisVersion(),
    logLevel: normalizeLogLevel(process.env.BFIS_LOG_LEVEL),
    generalLogPath: process.env.BFIS_LOG_PATH ?? "logs/bfis-service.log",
    olympusFrontendBaseUrl: frontendBaseUrl,
    olympusBaseUrl,
    olympusAuth: resolveOlympusAuth(),
    polling: resolvePollingConfig(),
    ndjsonLogPath: process.env.BFIS_NDJSON_LOG_PATH ?? "logs/bfis-decisions.ndjson",
    llm: resolveLlmConfig(),
    agents: resolveAgentConfig(),
  };
}
