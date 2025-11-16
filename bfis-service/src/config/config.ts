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
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export type OlympusRole = "GAME_MASTER" | "BLUE_COMMANDER" | "RED_COMMANDER" | "ADMIN";

export interface OlympusAuthConfig {
  role: OlympusRole;
  username: string;
  password: string;
}

export interface PollingConfig {
  unitsMs: number;
  weaponsMs: number;
  logsMs: number;
  missionMs: number;
  airbasesMs: number;
  bullseyesMs: number;
  spotsMs: number;
}

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
}

export interface BfisConfig {
  bfisVersion: string;
  logLevel: "debug" | "info" | "warn" | "error";
  olympusFrontendBaseUrl: string;
  olympusBaseUrl: string;
  olympusAuth: OlympusAuthConfig;
  polling: PollingConfig;
  ndjsonLogPath: string;
  llm: LlmConfig;
}

function loadEnvFileIfPresent(envPath: string): void {
  try {
    if (fs.existsSync(envPath)) {
      const contents = fs.readFileSync(envPath, "utf-8");
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex <= 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Fail silently; config loading will surface missing values if critical.
  }
}

function loadEnv(): void {
  // 1) Load standard .env for bfis-service if present
  const localEnvPath = path.resolve(__dirname, "..", "..", ".env");
  dotenv.config({ path: localEnvPath, override: false });

  // 2) Load shared/root .env if present (one level above bfis-service)
  const rootEnvPath = path.resolve(__dirname, "..", "..", "..", ".env");
  dotenv.config({ path: rootEnvPath, override: false });

  // 3) Load optional Olympus creds file used in this workspace
  //    /home/dcs/.creds/olympus_env.txt
  loadEnvFileIfPresent("/home/dcs/.creds/olympus_env.txt");
}

function detectBfisVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

function normalizeLogLevel(level: string | undefined): "debug" | "info" | "warn" | "error" {
  const normalized = (level ?? "info").toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "info";
}

function resolveOlympusBaseUrls(): { frontendBaseUrl: string; olympusBaseUrl: string } {
  // Frontend base URL (where the React/Express server is listening)
  const frontendBaseUrl = process.env.OLYMPUS_BASE_URL ?? "http://localhost:3000";

  // BFIS-specific Olympus base URL; if not set, derive from OLYMPUS_BASE_URL
  let olympusBaseUrl = process.env.BFIS_OLYMPUS_BASE_URL;
  if (!olympusBaseUrl) {
    // Default: append /olympus to the frontend base URL if not already present
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

function resolveOlympusAuth(): OlympusAuthConfig {
  const roleEnv = (process.env.BFIS_OLYMPUS_ROLE ?? "GAME_MASTER").toUpperCase();
  let role: OlympusRole = "GAME_MASTER";
  if (roleEnv === "BLUE_COMMANDER") role = "BLUE_COMMANDER";
  else if (roleEnv === "RED_COMMANDER") role = "RED_COMMANDER";
  else if (roleEnv === "ADMIN") role = "ADMIN";

  // Default to Game master creds if BFIS-specific values are not provided
  let username = process.env.BFIS_OLYMPUS_USERNAME;
  let password = process.env.BFIS_OLYMPUS_PASSWORD;

  if (!username || !password) {
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
    throw new Error("Missing Olympus credentials. Ensure BFIS_OLYMPUS_USERNAME/BFIS_OLYMPUS_PASSWORD or OLYMPUS_* vars are set.");
  }

  return {
    role,
    username,
    password,
  };
}

function resolvePollingConfig(): PollingConfig {
  // Defaults based on MVP spec
  return {
    unitsMs: Number(process.env.BFIS_POLL_UNITS_MS ?? 2000),
    weaponsMs: Number(process.env.BFIS_POLL_WEAPONS_MS ?? 2000),
    logsMs: Number(process.env.BFIS_POLL_LOGS_MS ?? 1000),
    missionMs: Number(process.env.BFIS_POLL_MISSION_MS ?? 5000),
    airbasesMs: Number(process.env.BFIS_POLL_AIRBASES_MS ?? 10000),
    bullseyesMs: Number(process.env.BFIS_POLL_BULLSEYES_MS ?? 10000),
    spotsMs: Number(process.env.BFIS_POLL_SPOTS_MS ?? 2000),
  };
}

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
 */
export function loadConfig(): BfisConfig {
  loadEnv();

  const { frontendBaseUrl, olympusBaseUrl } = resolveOlympusBaseUrls();

  return {
    bfisVersion: process.env.BFIS_VERSION ?? detectBfisVersion(),
    logLevel: normalizeLogLevel(process.env.BFIS_LOG_LEVEL),
    olympusFrontendBaseUrl: frontendBaseUrl,
    olympusBaseUrl,
    olympusAuth: resolveOlympusAuth(),
    polling: resolvePollingConfig(),
    ndjsonLogPath: process.env.BFIS_NDJSON_LOG_PATH ?? "logs/bfis-decisions.ndjson",
    llm: resolveLlmConfig(),
  };
}
