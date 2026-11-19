// log-sink.ts
// Where log entries go besides the console. One sink at a time: KafkaLogSink registers itself on start()
// and removes itself on stop(); without a sink logs only go to the console.

import type { LogEntry } from "./log-types.ts";

export interface LogSink {
  send(entry: LogEntry): void;
}

let activeSink: LogSink | null = null;

/** Sets (or with null, removes) the sink of every logger. */
export function setLogSink(sink: LogSink | null): void {
  activeSink = sink;
}

/** The current sink, if any. */
export function readLogSink(): LogSink | null {
  return activeSink;
}
