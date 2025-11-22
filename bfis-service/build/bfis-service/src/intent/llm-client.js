/**
 * LLM client abstraction for provider-agnostic LLM calls.
 *
 * Supports Ollama, LLMstudio (MVP), extensible to OpenAI/Anthropic (future).
 * All agents use this interface for LLM interactions.
 */
/**
 * Ollama LLM client implementation.
 */
class OllamaClient {
    baseUrl;
    model;
    constructor(baseUrl, model) {
        this.baseUrl = baseUrl;
        this.model = model;
    }
    async invoke(prompt, options) {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.model,
                prompt,
                temperature: options?.temperature ?? 0.7,
                num_predict: options?.maxTokens,
                stop: options?.stopSequences,
                stream: false, // Disable streaming for simpler response handling
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        if (!data.response) {
            throw new Error(`Invalid Ollama response: missing 'response' field`);
        }
        return {
            content: data.response,
            usage: {
                promptTokens: data.prompt_eval_count,
                completionTokens: data.eval_count,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            },
        };
    }
    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
/**
 * No-op LLM client for rules-only mode.
 *
 * Throws error on invoke() to force fallback to rules-based decision-making.
 */
class NoOpLLMClient {
    async invoke() {
        throw new Error("LLM not configured - use rules-based fallback");
    }
    async isAvailable() {
        return false;
    }
}
/**
 * Create LLM client based on configuration.
 *
 * @param config - BFIS configuration containing LLM settings
 * @returns LLM client instance
 * @throws Error if provider not supported or configuration invalid
 */
export function createLLMClient(config) {
    // If provider is "none" or unavailable, return no-op client
    if (config.llm.provider === "none" || !config.llm.baseUrl || !config.llm.model) {
        return new NoOpLLMClient();
    }
    if (config.llm.provider === "ollama") {
        return new OllamaClient(config.llm.baseUrl, config.llm.model);
    }
    // LLMstudio implementation follows same pattern as Ollama but uses different API endpoint
    // For MVP, prioritize Ollama; LLMstudio can be added as extension if needed
    if (config.llm.provider === "llmstudio") {
        // TODO: Implement LLMstudio client when needed
        // Similar to OllamaClient but with LLMstudio-specific API endpoint
        throw new Error("LLMstudio provider not yet implemented - use Ollama for MVP");
    }
    throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
}
