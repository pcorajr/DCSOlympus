/**
 * Quick test script to verify LLM client connectivity.
 * 
 * Tests the Ollama connection and GPT-OSS model.
 */

import { createLLMClient } from "./src/intent/llm-client.js";
import { loadConfig } from "./src/config/config.js";

async function testLLM() {
  console.log("Testing LLM client connection...\n");
  
  const config = loadConfig();
  console.log("LLM Config:", {
    provider: config.llm.provider,
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
  });
  console.log();
  
  const client = createLLMClient(config);
  
  // Test availability
  console.log("Checking LLM availability...");
  const isAvailable = await client.isAvailable();
  console.log(`LLM Available: ${isAvailable}\n`);
  
  if (!isAvailable) {
    console.error("LLM is not available. Check connection to", config.llm.baseUrl);
    process.exit(1);
  }
  
  // Test a simple prompt
  console.log("Testing LLM with simple prompt...");
  const prompt = "Say 'Hello from BFIS' in exactly 5 words.";
  
  try {
    const response = await client.invoke(prompt, {
      temperature: 0.7,
      maxTokens: 50,
    });
    
    console.log("\n✅ LLM Response:");
    console.log(response.content);
    console.log("\nToken Usage:", response.usage);
  } catch (error) {
    console.error("\n❌ LLM Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testLLM().catch(console.error);

