// log-json.ts
// JSON text of a log entry for the console and for Kafka: bigint becomes text and it never throws.

import type { LogEntry } from "./log-types.ts";

function replaceJsonValue(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

/** JSON text of a log entry. */
export function toLogJson(entry: LogEntry): string {
  try {
    return JSON.stringify(entry, replaceJsonValue);
  } catch {
    const fallback = { level: entry.level, message: entry.message, timestamp: entry.timestamp, log_error: "UNSERIALIZABLE_DATA" };
    return JSON.stringify(fallback);
  }
}
