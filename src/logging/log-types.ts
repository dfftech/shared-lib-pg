// log-types.ts
// Types of the app logger. Field names are snake_case, the same as the Kafka logs of the Encore core stack,
// so one log consumer reads the logs of both stacks.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogData = Record<string, unknown>;

/** Fields every log entry of a request carries. */
export type LogContext = {
  service?: string;
  request_id?: string;
  trace_id?: string;
  session_user_id?: string;
  tenant_id?: string;
  branch_id?: string;
};

/** One log entry as written to the console and to Kafka. */
export type LogEntry = LogData &
  LogContext & {
    level: LogLevel;
    message: string;
    timestamp: string;
  };

/** Gives the context of a logger at the moment it writes (tenant and user can change during a request). */
export interface LogContextReader {
  readLogContext(): LogContext;
}

export interface AppLogger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
}
