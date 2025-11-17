/**
 * Standalone test script for SnapshotReader against running DCS mission.
 *
 * This script allows you to test the Phase 3 (User Story 1) implementation
 * against a live Olympus instance with a running DCS mission.
 *
 * Usage:
 *   cd bfis-service
 *   npm run build
 *   node build/test-snapshot-reader.js
 *
 * Or with ts-node:
 *   npx ts-node --esm test-snapshot-reader.ts
 */
import { loadConfig } from "./bfis-service/src/config/config.js";
import { createStructuredLogger } from "./bfis-service/src/logger/structured-logger.js";
import { SnapshotReader } from "./bfis-service/src/snapshot/snapshot-reader.js";
async function main() {
    console.log("=== BFIS SnapshotReader Test (User Story 1) ===\n");
    try {
        // Load configuration
        console.log("1. Loading configuration...");
        const config = loadConfig();
        console.log(`   ✓ Config loaded: ${config.olympusBaseUrl}`);
        console.log(`   ✓ Role: ${config.olympusAuth.role}`);
        console.log(`   ✓ Username: ${config.olympusAuth.username}\n`);
        // Create logger
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        // Create SnapshotReader
        console.log("2. Creating SnapshotReader...");
        const reader = new SnapshotReader(config, logger);
        console.log("   ✓ SnapshotReader created\n");
        // Test probeMissionOnce
        console.log("3. Testing probeMissionOnce (connectivity probe)...");
        try {
            await reader.probeMissionOnce();
            console.log("   ✓ Probe successful - BFIS can connect to Olympus\n");
        }
        catch (err) {
            console.error("   ✗ Probe failed:", err instanceof Error ? err.message : String(err));
            console.error("\n   Make sure:");
            console.error("   - Olympus is running and accessible");
            console.error("   - DCS mission is loaded");
            console.error("   - Credentials are correct in /home/dcs/.creds/olympus_env.txt");
            process.exit(1);
        }
        // Test readOnce
        console.log("4. Testing readOnce (snapshot construction)...");
        try {
            const snapshot = await reader.readOnce();
            console.log("   ✓ Snapshot created successfully!\n");
            console.log("   Snapshot details:");
            console.log(`   - snapshotId: ${snapshot.snapshotId}`);
            console.log(`   - missionId: ${snapshot.missionId}`);
            console.log(`   - serverId: ${snapshot.serverId}`);
            console.log(`   - sessionHash: ${snapshot.sessionHash}`);
            console.log(`   - time: ${snapshot.time}`);
            console.log(`   - units: ${snapshot.units.length} (empty for User Story 1)\n`);
            // Verify snapshot structure
            console.log("5. Verifying snapshot structure...");
            const checks = [
                { name: "snapshotId is UUID v4", pass: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.snapshotId) },
                { name: "missionId is non-empty", pass: snapshot.missionId.length > 0 },
                { name: "serverId is non-empty", pass: snapshot.serverId.length > 0 },
                { name: "sessionHash is non-empty", pass: snapshot.sessionHash.length > 0 },
                { name: "time is ISO 8601", pass: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(snapshot.time) },
                { name: "units is array", pass: Array.isArray(snapshot.units) },
                { name: "units is empty (User Story 1)", pass: snapshot.units.length === 0 },
            ];
            let allPassed = true;
            for (const check of checks) {
                const status = check.pass ? "✓" : "✗";
                console.log(`   ${status} ${check.name}`);
                if (!check.pass)
                    allPassed = false;
            }
            if (allPassed) {
                console.log("\n   ✓ All checks passed!\n");
            }
            else {
                console.log("\n   ✗ Some checks failed\n");
                process.exit(1);
            }
            console.log("=== Test Complete ===");
            console.log("\nUser Story 1 is working correctly!");
            console.log("BFIS can now:");
            console.log("  - Connect to Olympus");
            console.log("  - Authenticate successfully");
            console.log("  - Retrieve mission data");
            console.log("  - Construct snapshots with mission metadata\n");
        }
        catch (err) {
            console.error("   ✗ readOnce failed:", err instanceof Error ? err.message : String(err));
            if (err instanceof Error && err.stack) {
                console.error("\n   Stack trace:");
                console.error(err.stack);
            }
            process.exit(1);
        }
    }
    catch (err) {
        console.error("\n✗ Fatal error:", err instanceof Error ? err.message : String(err));
        if (err instanceof Error && err.stack) {
            console.error("\nStack trace:");
            console.error(err.stack);
        }
        process.exit(1);
    }
}
// Run the test
void main();
