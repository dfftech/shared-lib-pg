// app-logger.ts
// Structured logger. Every entry is masked (log-mask.ts), written to the console as one JSON line and given to the
// log sink (KafkaLogSink: the Kafka topic of its tenant). Never waits for Kafka.
//   const log = readLogger();               // request logger (request_id, tenant_id ...) or appLogger
//   log.info("Saved address", { id });
//   const jobLog = createLogger({ tenant_id: "acme" });
// Level and service name come from the app config (log.level, serviceName).

import { readAppConfig } from "../config/app-config.ts";
import { maskLogData } from "../utils/log-mask.ts";
import { toLogJson } from "./log-json.ts";
import { readLogSink } from "./log-sink.ts";
import type { AppLogger, LogContext, LogContextReader, LogData, LogEntry, LogLevel } from "./log-types.ts";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Lowest level that is written (config log.level). */
export function readLogLevel(): LogLevel {
  const config = readAppConfig();
  return config.log.level;
}

/** True when entries of this level are written. */
export function isLevelEnabled(level: LogLevel): boolean {
  const minimumLevel = readLogLevel();
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minimumLevel];
}

function writeConsoleLog(entry: LogEntry): void {
  const line = toLogJson(entry);
  if (entry.level === "error") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

/** Builds the entry for a message: masked data, then the context (it wins over data keys). */
export function buildLogEntry(context: LogContext, level: LogLevel, message: string, data?: LogData): LogEntry {
  const safeData = maskLogData(data ?? {});
  const now = new Date();
  const timestamp = now.toISOString();
  const config = readAppConfig();
  const service = context.service ?? config.serviceName;
  return { ...safeData, ...context, service, level, message, timestamp };
}

/** Writes one entry: console JSON line + the log sink (Kafka, when started). */
export function writeLog(context: LogContext, level: LogLevel, message: string, data?: LogData): void {
  const isEnabled = isLevelEnabled(level);
  if (!isEnabled) {
    return;
  }
  const entry = buildLogEntry(context, level, message, data);
  writeConsoleLog(entry);
  const sink = readLogSink();
  sink?.send(entry);
}

/** Log context that never changes (app logger, background jobs). */
export class FixedLogContext implements LogContextReader {
  private readonly context: LogContext;

  constructor(context: LogContext) {
    this.context = context;
  }

  readLogContext(): LogContext {
    return this.context;
  }
}

/** Logger that reads its context at every write. */
export class ContextLogger implements AppLogger {
  private readonly source: LogContextReader;

  constructor(source: LogContextReader) {
    this.source = source;
  }

  debug(message: string, data?: LogData): void {
    const context = this.source.readLogContext();
    writeLog(context, "debug", message, data);
  }

  info(message: string, data?: LogData): void {
    const context = this.source.readLogContext();
    writeLog(context, "info", message, data);
  }

  warn(message: string, data?: LogData): void {
    const context = this.source.readLogContext();
    writeLog(context, "warn", message, data);
  }

  error(message: string, data?: LogData): void {
    const context = this.source.readLogContext();
    writeLog(context, "error", message, data);
  }
}

/** Logger with a fixed context, for work outside a request: createLogger({ tenant_id: "acme" }). */
export function createLogger(context: LogContext = {}): AppLogger {
  const source = new FixedLogContext(context);
  return new ContextLogger(source);
}

/** Logger of the service itself (startup, database, Kafka). */
export const appLogger: AppLogger = createLogger();
