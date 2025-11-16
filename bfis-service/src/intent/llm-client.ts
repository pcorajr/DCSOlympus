/**
 * LLM Client - Abstraction for LLM providers.
 * 
 * Per spec: MVP supports Ollama/LLMstudio (local LLM) via HTTP API.
 * Future: extensible to cloud-based LLMs (OpenAI, Anthropic, etc.).
 * 
 * This client provides a unified interface for different LLM providers,
 * allowing BFIS to switch between local and cloud LLMs via configuration.
 * 
 * The Intent & Dialogue Layer uses an LLM to interpret natural-language input
 * and turn player intent into concrete BFIS actions or scenario-building steps.
 * 
 * TODO: Implement Ollama and LLMstudio clients, with abstraction for future cloud providers.
 */
