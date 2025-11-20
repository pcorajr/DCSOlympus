/**
 * BFIS Data Recorder - Continuous Snapshot Capture
 *
 * Records complete battlefield snapshots to JSON files for analysis.
 * Captures EVERYTHING: units (with human/controlled flags), weapons (full details),
 * logs, airbases, bullseyes, spots, drawings - complete state.
 *
 * Usage (Docker only):
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     -v /home/dcs/DCSOlympus/bfis-service/data-capture:/app/bfis-service/data-capture \
 *     bfis-service \
 *     node build/bfis-service/src/scripts/data-recorder.js [interval-seconds]
 *
 * Interval range: 1-5 seconds (default: 2 seconds)
 * Output: bfis-service/logs/snapshot_YYYY-MM-DD_HH-MM-SS.json
 */
import { SnapshotReader } from "../snapshot/snapshot-reader.js";
import { loadConfig } from "../config/config.js";
import { createStructuredLogger } from "../logger/structured-logger.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
async function main() {
    const rawInterval = process.argv[2];
    const intervalSeconds = rawInterval ? parseInt(rawInterval, 10) : 2;
    // Validate interval range (1-5 seconds)
    if (isNaN(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 5) {
        console.error("Error: Interval must be between 1 and 5 seconds");
        console.error(`Received: ${rawInterval || "default (2)"}`);
        console.error("Usage: node data-recorder.js [interval-seconds]");
        console.error("  interval-seconds: 1-5 (default: 2)");
        process.exit(1);
    }
    // In Docker container, working directory is /app/bfis-service
    // Output directory should be /app/bfis-service/logs (same as service logs)
    const outputDir = path.join(process.cwd(), "logs");
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true });
    }
    const config = loadConfig();
    const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
    const reader = new SnapshotReader(config, logger);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  BFIS DATA RECORDER - CONTINUOUS CAPTURE");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`Output Directory: ${outputDir}`);
    console.log(`Capture Interval: ${intervalSeconds} seconds`);
    console.log("Recording ALL data: units, weapons, logs, everything...");
    console.log("Press Ctrl+C to stop\n");
    let captureCount = 0;
    const captureSnapshot = async () => {
        try {
            const snapshot = await reader.readContextOnce();
            // Get full weapon data from cache
            const weaponCache = reader.weaponCache;
            const allWeapons = Array.from(weaponCache.values());
            // Build full snapshot data
            const fullData = {
                timestamp: new Date().toISOString(),
                snapshotId: snapshot.base.snapshotId,
                sessionHash: snapshot.base.sessionHash,
                mission: {
                    missionId: snapshot.base.missionId,
                    serverId: snapshot.base.serverId,
                },
                units: snapshot.base.units.map(u => ({
                    unitId: u.unitId,
                    groupId: u.groupId,
                    name: u.name,
                    coalition: u.coalition,
                    category: u.category,
                    unitType: u.unitType,
                    position: u.position,
                    status: u.status,
                    human: u.human,
                    controlled: u.controlled,
                })),
                weapons: allWeapons.map(w => ({
                    weaponId: w.weaponId,
                    category: w.category,
                    alive: w.alive,
                    coalition: w.coalition,
                    name: w.name,
                    position: w.position,
                    speed: w.speed,
                    heading: w.heading,
                    updateTime: w.updateTime,
                })),
                logs: snapshot.logs.map(l => ({
                    id: l.id,
                    timestamp: l.timestamp,
                    category: l.category,
                    message: l.message,
                    fields: l.fields,
                })),
                airbases: snapshot.airbases,
                bullseyes: snapshot.bullseyes,
                spots: snapshot.spots,
                drawings: snapshot.drawings,
                weaponsSummary: snapshot.weaponsSummary,
            };
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
            const filename = `snapshot_${timestamp}.json`;
            const filepath = path.join(outputDir, filename);
            // Write to file
            await writeFile(filepath, JSON.stringify(fullData, null, 2), "utf-8");
            captureCount++;
            const playerUnits = fullData.units.filter(u => u.human === true).length;
            const activeWeapons = fullData.weapons.filter(w => w.alive).length;
            console.log(`[${new Date().toISOString()}] Capture #${captureCount}: ${fullData.units.length} units (${playerUnits} player), ${fullData.weapons.length} weapons (${activeWeapons} active), ${fullData.logs.length} logs -> ${filename}`);
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] Capture failed:`, error instanceof Error ? error.message : String(error));
        }
    };
    // Initial capture
    await captureSnapshot();
    // Set up interval
    const intervalId = setInterval(captureSnapshot, intervalSeconds * 1000);
    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log(`\n\nStopping recorder... Total captures: ${captureCount}`);
        clearInterval(intervalId);
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        console.log(`\n\nStopping recorder... Total captures: ${captureCount}`);
        clearInterval(intervalId);
        process.exit(0);
    });
}
void main();
