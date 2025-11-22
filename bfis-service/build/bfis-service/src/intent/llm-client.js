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
 * LLMstudio LLM client implementation.
 *
 * LLMstudio uses OpenAI-compatible API endpoints.
 */
class LLMstudioClient {
    baseUrl;
    model;
    constructor(baseUrl, model) {
        this.baseUrl = baseUrl;
        this.model = model;
    }
    async invoke(prompt, options) {
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
                stop: options?.stopSequences,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLMstudio API error: ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error(`Invalid LLMstudio response: missing 'choices[0].message' field`);
        }
        return {
            content: data.choices[0].message.content || "",
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
        };
    }
    async isAvailable() {
        try {
            // LLMstudio typically has a /v1/models endpoint for health checks
            const response = await fetch(`${this.baseUrl}/v1/models`, { method: "GET" });
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
    if (config.llm.provider === "llmstudio") {
        return new LLMstudioClient(config.llm.baseUrl, config.llm.model);
    }
    throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
}
