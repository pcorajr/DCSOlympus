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
  };
}

/**
 * Resolve LLM configuration.
 *
 * If provider is "none", BFIS operates in rules-based mode only.
 * Empty strings for baseUrl/model indicate LLM is not configured.
 *
 * @returns LLM configuration
 */
function resolveLlmConfig(): LlmConfig {
  return {
    provider: process.env.BFIS_LLM_PROVIDER ?? "none",
    baseUrl: process.env.BFIS_LLM_BASE_URL ?? "",
    model: process.env.BFIS_LLM_MODEL ?? "",
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
  };
}
