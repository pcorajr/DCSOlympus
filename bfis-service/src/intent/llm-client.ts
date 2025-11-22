/**
 * LLM client abstraction for provider-agnostic LLM calls.
 *
 * Supports Ollama, LLMstudio (MVP), extensible to OpenAI/Anthropic (future).
 * All agents use this interface for LLM interactions.
 */

import type { BfisConfig } from "../config/config.js";

/**
 * LLM invocation options.
 */
export interface LLMOptions {
  /** Temperature for response randomness (0.0-2.0). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Stop sequences that terminate generation. */
  stopSequences?: string[];
}

/**
 * LLM response containing generated content and usage statistics.
 */
export interface LLMResponse {
  /** Generated text content. */
  content: string;
  /** Optional token usage statistics. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Optional tool calls made by the LLM. */
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * Tool definition for LLM tool calling.
 */
export interface ToolDefinition {
  /** Tool name (must match the function name). */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** JSON schema for tool parameters (Zod schema or plain object). */
  schema: unknown;
  /** The actual function to invoke when tool is called. */
  invoke: (args: unknown) => Promise<string>;
}

/**
 * LLM client abstraction for provider-agnostic LLM calls.
 *
 * All agents use this interface for LLM interactions, allowing
 * seamless switching between providers (Ollama, LLMstudio, etc.).
 */
export interface LLMClient {
  /**
   * Invoke LLM with prompt and options.
   *
   * @param prompt - The prompt text to send to LLM
   * @param options - LLM invocation options (temperature, maxTokens, etc.)
   * @returns LLM response with content
   * @throws Error if LLM service unavailable or request fails
   */
  invoke(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Invoke LLM with tool calling support.
   *
   * Per Spec-005: Enable LLM to call tools (e.g., Intel agent tools) on demand.
   * Uses JSON-based tool calling protocol for providers without native tool support.
   *
   * @param prompt - The prompt text to send to LLM
   * @param tools - Array of tool definitions the LLM can call
   * @param options - LLM invocation options (temperature, maxTokens, etc.)
   * @returns LLM response with content (after tool execution if requested)
   * @throws Error if LLM service unavailable or request fails
   */
  invokeWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: LLMOptions
  ): Promise<LLMResponse>;

  /**
   * Check if LLM service is available.
   *
   * @returns True if LLM service is reachable, false otherwise
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Ollama LLM client implementation.
 */
class OllamaClient implements LLMClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async invoke(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
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

  async invokeWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    // Build tool-aware prompt with JSON protocol
    const toolDescriptions = tools.map(t => 
      `- ${t.name}: ${t.description}`
    ).join('\n');

    const toolAwarePrompt = `${prompt}

AVAILABLE TOOLS:
${toolDescriptions}

TOOL CALLING PROTOCOL:
If you need to call a tool to answer the question, respond with ONLY a JSON object in this exact format:
{"tool": "<tool_name>", "arguments": {<args>}}

If you don't need a tool, respond normally in natural language.

Your response:`;

    // First LLM call: check if tool is needed
    const firstResponse = await this.invoke(toolAwarePrompt, options);
    
    // Try to parse as tool call
    const toolCall = this.parseToolCall(firstResponse.content);
    
    if (!toolCall) {
      // No tool call - return natural language response
      return firstResponse;
    }

    // Execute the requested tool
    const tool = tools.find(t => t.name === toolCall.toolName);
    if (!tool) {
      // Tool not found - return error message
      return {
        content: `Error: Tool '${toolCall.toolName}' not found. Available tools: ${tools.map(t => t.name).join(', ')}`,
        usage: firstResponse.usage,
      };
    }

    let toolResult: string;
    try {
      toolResult = await tool.invoke(toolCall.arguments);
    } catch (error) {
      toolResult = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Second LLM call: generate final answer using tool result
    const finalPrompt = `${prompt}

I called the tool '${toolCall.toolName}' with arguments: ${JSON.stringify(toolCall.arguments)}

The tool returned this result:
${toolResult}

Using this information, please answer the user's question in natural language:`;

    const finalResponse = await this.invoke(finalPrompt, options);
    
    return {
      content: finalResponse.content,
      usage: finalResponse.usage,
      toolCalls: [{
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
      }],
    };
  }

  /**
   * Parse LLM response to detect tool call requests.
   * 
   * @param content - LLM response content
   * @returns Parsed tool call or null if not a tool call
   */
  private parseToolCall(content: string): { toolName: string; arguments: Record<string, unknown> } | null {
    try {
      // Try to extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.tool && typeof parsed.tool === 'string') {
        return {
          toolName: parsed.tool,
          arguments: parsed.arguments || {},
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * LLMstudio LLM client implementation.
 *
 * LLMstudio uses OpenAI-compatible API endpoints.
 */
class LLMstudioClient implements LLMClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async invoke(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
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

  async invokeWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    // Build tool-aware prompt with JSON protocol
    const toolDescriptions = tools.map(t => 
      `- ${t.name}: ${t.description}`
    ).join('\n');

    const toolAwarePrompt = `${prompt}

AVAILABLE TOOLS:
${toolDescriptions}

TOOL CALLING PROTOCOL:
If you need to call a tool to answer the question, respond with ONLY a JSON object in this exact format:
{"tool": "<tool_name>", "arguments": {<args>}}

If you don't need a tool, respond normally in natural language.

Your response:`;

    // First LLM call: check if tool is needed
    const firstResponse = await this.invoke(toolAwarePrompt, options);
    
    // Try to parse as tool call
    const toolCall = this.parseToolCall(firstResponse.content);
    
    if (!toolCall) {
      // No tool call - return natural language response
      return firstResponse;
    }

    // Execute the requested tool
    const tool = tools.find(t => t.name === toolCall.toolName);
    if (!tool) {
      // Tool not found - return error message
      return {
        content: `Error: Tool '${toolCall.toolName}' not found. Available tools: ${tools.map(t => t.name).join(', ')}`,
        usage: firstResponse.usage,
      };
    }

    let toolResult: string;
    try {
      toolResult = await tool.invoke(toolCall.arguments);
    } catch (error) {
      toolResult = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Second LLM call: generate final answer using tool result
    const finalPrompt = `${prompt}

I called the tool '${toolCall.toolName}' with arguments: ${JSON.stringify(toolCall.arguments)}

The tool returned this result:
${toolResult}

Using this information, please answer the user's question in natural language:`;

    const finalResponse = await this.invoke(finalPrompt, options);
    
    return {
      content: finalResponse.content,
      usage: finalResponse.usage,
      toolCalls: [{
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
      }],
    };
  }

  /**
   * Parse LLM response to detect tool call requests.
   * 
   * @param content - LLM response content
   * @returns Parsed tool call or null if not a tool call
   */
  private parseToolCall(content: string): { toolName: string; arguments: Record<string, unknown> } | null {
    try {
      // Try to extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.tool && typeof parsed.tool === 'string') {
        return {
          toolName: parsed.tool,
          arguments: parsed.arguments || {},
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // LLMstudio typically has a /v1/models endpoint for health checks
      const response = await fetch(`${this.baseUrl}/v1/models`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * No-op LLM client for rules-only mode.
 *
 * Throws error on invoke() to force fallback to rules-based decision-making.
 */
class NoOpLLMClient implements LLMClient {
  async invoke(): Promise<LLMResponse> {
    throw new Error("LLM not configured - use rules-based fallback");
  }

  async invokeWithTools(): Promise<LLMResponse> {
    throw new Error("LLM not configured - use rules-based fallback");
  }

  async isAvailable(): Promise<boolean> {
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
export function createLLMClient(config: BfisConfig): LLMClient {
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
