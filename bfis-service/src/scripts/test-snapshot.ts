/**
 * Simple test script to fetch and display a snapshot from Olympus
 */

import { loadConfig } from "../config/config.js";
import { createStructuredLogger } from "../logger/structured-logger.js";
import { SnapshotReader } from "../snapshot/snapshot-reader.js";

const config = loadConfig();
const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
const snapshotReader = new SnapshotReader(config, logger);

console.log("=".repeat(80));
console.log("Fetching snapshot from Olympus...");
console.log("=".repeat(80));
console.log("\n");

try {
  const snapshot = await snapshotReader.readContextOnce();

  console.log("SNAPSHOT DATA:");
  console.log("=".repeat(80));
  console.log(JSON.stringify(snapshot, null, 2));
  
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY:");
  console.log("=".repeat(80));
  console.log(`Snapshot ID: ${snapshot.base.snapshotId}`);
  console.log(`Mission ID: ${snapshot.base.missionId}`);
  console.log(`Server ID: ${snapshot.base.serverId}`);
  console.log(`Session Hash: ${snapshot.base.sessionHash}`);
  console.log(`Time: ${snapshot.base.time}`);
  console.log(`Units: ${snapshot.base.units.length}`);
  console.log(`  - BLUE: ${snapshot.base.units.filter(u => u.coalition === "BLUE").length}`);
  console.log(`  - RED: ${snapshot.base.units.filter(u => u.coalition === "RED").length}`);
  console.log(`  - NEUTRAL: ${snapshot.base.units.filter(u => u.coalition === "NEUTRAL").length}`);
  console.log(`Airbases: ${snapshot.airbases.length}`);
  console.log(`Bullseyes: ${snapshot.bullseyes.length}`);
  console.log(`Hostilities Started: ${snapshot.hostility.hostilitiesStarted}`);
  
  if (snapshot.base.units.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("SAMPLE UNITS (first 5):");
    console.log("=".repeat(80));
    snapshot.base.units.slice(0, 5).forEach((unit, idx) => {
      console.log(`${idx + 1}. ${unit.unitId} (${unit.coalition}) - ${unit.category} at [${unit.position.lat}, ${unit.position.lon}]`);
    });
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("SUCCESS - Snapshot fetched and displayed");
  console.log("=".repeat(80));
} catch (error) {
  console.error("ERROR fetching snapshot:", error);
  process.exit(1);
}

