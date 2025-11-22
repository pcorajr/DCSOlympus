/**
 * Simple test script to show full LLM output for battlefield summarization
 */

import { loadConfig } from "./src/config/config.js";
import { createStructuredLogger } from "./src/logger/structured-logger.js";
import { Orchestrator } from "./src/agents/orchestrator.js";
import { v4 as uuidv4 } from "uuid";

const config = loadConfig();
const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
const orchestrator = new Orchestrator(config, logger);

// Create a mock snapshot
const mockSnapshot = {
  base: {
    snapshotId: "test-snapshot-1",
    missionId: "test-mission",
    serverId: "test-server",
    sessionHash: "test-session",
    time: new Date().toISOString(),
    units: [
      {
        unitId: "u1",
        coalition: "BLUE",
        category: "Aircraft",
        position: { lat: 40.0, lon: -75.0, altMeters: 10000 },
      },
      {
        unitId: "u2",
        coalition: "RED",
        category: "GroundUnit",
        position: { lat: 41.0, lon: -76.0, altMeters: 0 },
      },
    ],
  },
  airbases: [
    {
      id: "ab1",
      name: "Batumi",
      coalition: "BLUE",
      position: { lat: 41.6, lon: 41.6, altMeters: 100 },
    },
  ],
  bullseyes: [
    {
      id: "be1",
      coalition: "RED",
      position: { lat: 42.0, lon: -77.0, altMeters: 0 },
    },
  ],
  spots: [],
  drawings: [],
  logs: [],
  weaponsSummary: { lastUpdateTime: 0, activeCount: 0 },
  hostility: { hostilitiesStarted: false, sessionHash: "test-session" },
};

const initialState = {
  currentSnapshot: mockSnapshot,
  previousSnapshot: null,
  intelOutput: null,
  commanderInput: null,
  decision: null,
  writerInput: null,
  commandResults: null,
  error: null,
  cycleId: uuidv4(),
  cycleStartTime: new Date().toISOString(),
  cycleEndTime: null,
};

console.log("=".repeat(80));
console.log("BFIS Multi-Agent LLM Architecture - Full Cycle Output");
console.log("=".repeat(80));
console.log("\n");

const finalState = await orchestrator.runCycle(initialState);

console.log("\n" + "=".repeat(80));
console.log("INTEL SUMMARY:");
console.log("=".repeat(80));
console.log(JSON.stringify(finalState.intelOutput?.summary, null, 2));

console.log("\n" + "=".repeat(80));
console.log("COMMANDER DECISION (Full LLM Output):");
console.log("=".repeat(80));
console.log(JSON.stringify(finalState.decision, null, 2));

console.log("\n" + "=".repeat(80));
console.log("COMMAND RESULTS:");
console.log("=".repeat(80));
console.log(JSON.stringify(finalState.commandResults, null, 2));

console.log("\n" + "=".repeat(80));
console.log("CYCLE COMPLETE");
console.log("=".repeat(80));

