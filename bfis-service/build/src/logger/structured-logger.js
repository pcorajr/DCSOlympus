/**
 * Structured logger for BFIS service events, probes, and errors.
 *
 * Per constitution Article IX: All service events, probes, errors, and decision cycles
 * MUST emit structured JSON records. This logger provides a consistent interface for
 * writing structured logs to both stdout/stderr (for Docker container logs) and to
 * files on disk (for persistence and analysis).
 *
 * Log format:
 * - One JSON record per log entry
 * - Fields: ts (ISO timestamp), level (debug|info|warn|error), event (stable event name), plus metadata
 * - Machine-parseable for log aggregation and filtering
 */
import fs from "fs";
import path from "path";
/**
 * Convert log level to numeric value for comparison.
 *
 * Used to determine if a message should be logged based on the minimum level.
 *
 * @param level - Log level string
 * @returns Numeric value (0=debug, 1=info, 2=warn, 3=error)
 */
function levelToNumber(level) {
    switch (level) {
        case "debug":
            return 0;
        case "info":
            return 1;
        case "warn":
            return 2;
        case "error":
            return 3;
        default:
            return 1;
    }
}
/**
 * Create a structured logger that writes JSON lines to both stdout/stderr
 * and to a file on disk.
 *
 * Per constitution: Logs MUST be written to files under the BFIS logs folder
 * in addition to stdout/stderr when running in Docker. This ensures logs are
 * available both for container log aggregation and for persistent analysis.
 *
 * The file path is resolved relative to the current working directory.
 * The log directory is created if it doesn't exist.
 *
 * @param logPath - Target log file path (for example `logs/bfis-service.log`)
 * @param minLevel - Minimum log level to emit (messages below this are dropped)
 * @returns StructuredLogger instance used across the BFIS service
 */
export function createStructuredLogger(logPath, minLevel) {
    const resolvedPath = path.resolve(logPath);
    const dir = path.dirname(resolvedPath);
    // Ensure log directory exists before attempting to write
    // This prevents "ENOENT" errors when the directory structure doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const minLevelNumber = levelToNumber(minLevel);
    /**
     * Check if a message at the given level should be logged.
     *
     * Messages below the minimum level are dropped to reduce log volume.
     *
     * @param level - Log level to check
     * @returns True if the message should be logged
     */
    function shouldLog(level) {
        return levelToNumber(level) >= minLevelNumber;
    }
    /**
     * Write a log record to both stdout/stderr and the log file.
     *
     * Errors go to stderr, all other levels go to stdout. This allows Docker
     * log aggregation tools to separate errors from normal logs.
     *
     * @param level - Log level
     * @param event - Event name
     * @param meta - Optional metadata
     */
    async function write(level, event, meta) {
        if (!shouldLog(level))
            return;
        // Build structured JSON record with timestamp, level, event, and metadata
        // This format is machine-parseable and consistent across all BFIS logs
        const record = {
            ts: new Date().toISOString(),
            level,
            event,
            ...(meta ?? {}),
        };
        const line = JSON.stringify(record);
        // Route errors to stderr, everything else to stdout
        // This enables Docker log aggregation to separate error streams
        if (level === "error") {
            // eslint-disable-next-line no-console
            console.error(line);
        }
        else {
            // eslint-disable-next-line no-console
            console.log(line);
        }
        // Also write to file for persistence
        // Using appendFile ensures atomic writes (one record = one write operation)
        await fs.promises.appendFile(resolvedPath, `${line}\n`, { encoding: "utf8" });
    }
    return {
        debug(event, meta) {
            // Use void to explicitly ignore the promise (fire-and-forget logging)
            void write("debug", event, meta);
        },
        info(event, meta) {
            void write("info", event, meta);
        },
        warn(event, meta) {
            void write("warn", event, meta);
        },
        error(event, meta) {
            void write("error", event, meta);
        },
    };
}
