/**
 * Configuration management for BFIS service.
 * 
 * Per spec: Loads configuration from environment variables with defaults.
 * Configuration includes:
 * - Olympus URL and authentication (Game Master credentials)
 * - Polling intervals (units: 2000ms, logs: 1000-2000ms, mission: 5000-10000ms)
 * - LLM configuration (provider, baseUrl, model, etc.)
 * - Log path for NDJSON decision logs
 * - BFIS version and verbose logging flags
 * 
 * TODO: Implement configuration loading from environment variables.
 */
