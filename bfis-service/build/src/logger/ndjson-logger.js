/**
 * NDJSON Logger - Writes decision logs for replay and debugging.
 *
 * Per spec: BFIS logs one line of NDJSON per decision cycle. Each line is a
 * self-contained record; no cross-file magic.
 *
 * This module provides a minimal, reusable logger that appends JSON records
 * to a configured NDJSON file. Higher-level code is responsible for shaping
 * the record to match the BFIS decision log schema.
 *
 * Log format requirements (per spec):
 * - One record per decision cycle
 * - Stable top-level field names for tooling compatibility
 * - Summaries and hashes over full raw data (privacy and size)
 * - Includes: ts, decisionId, snapshotId, actions, olympusCommands, etc.
 *
 * Implementation details:
 * - Creates log directory if it doesn't exist
 * - Appends records atomically (one write per record)
 * - No buffering or batching (ensures durability)
 * - Thread-safe for concurrent writes (Node.js single-threaded event loop)
 */
import fs from "fs";
import path from "path";
/**
 * Create an NDJSON logger that writes to the specified file path.
 *
 * The log directory is created if it doesn't exist. The file is created
 * on first write if it doesn't exist.
 *
 * @param logPath - Path to the NDJSON log file (relative or absolute)
 * @returns Logger instance that appends records to the file
 */
export function createNdjsonLogger(logPath) {
    const resolvedPath = path.resolve(logPath);
    const dir = path.dirname(resolvedPath);
    // Ensure log directory exists before attempting to write
    // This prevents "ENOENT" errors when the directory structure doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return {
        async log(record) {
            // Serialize to JSON and append with newline
            // Using appendFile ensures atomic writes (one record = one write operation)
            const line = JSON.stringify(record);
            await fs.promises.appendFile(resolvedPath, `${line}\n`, { encoding: "utf8" });
        },
    };
}
