/**
 * NDJSON Logger - Writes decision logs for replay and debugging.
 *
 * Per spec: BFIS logs one line of NDJSON per decision cycle. Each line is a
 * self-contained record; no cross-file magic.
 *
 * This module provides a minimal, reusable logger that appends JSON records
 * to a configured NDJSON file. Higher-level code is responsible for shaping
 * the record to match the BFIS decision log schema.
 */

import fs from "fs";
import path from "path";

export interface NdjsonLogger {
  log(record: unknown): Promise<void>;
}

export function createNdjsonLogger(logPath: string): NdjsonLogger {
  const resolvedPath = path.resolve(logPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    async log(record: unknown): Promise<void> {
      const line = JSON.stringify(record);
      await fs.promises.appendFile(resolvedPath, `${line}\n`, { encoding: "utf8" });
    },
  };
}
