// kafka-log-sink.ts
// Kafka sink of the app logger, built from the config (kafka.log). Entries are queued (kafka-log-queue.ts) and sent
// every flushMs or as soon as a batch is full, so a request never waits for Kafka. When Kafka is down the queue keeps
// the newest entries and every flush tries to connect again; a problem is reported once per 30 seconds.
//   const sink = new KafkaLogSink(config.kafka.log, kafkaClient);   // Application does this
//   await sink.start();  ...  await sink.stop();

import type { KafkaLogConfig } from "../config/app-config.ts";
import { setLogSink, type LogSink } from "../logging/log-sink.ts";
import type { LogEntry } from "../logging/log-types.ts";
import { readErrorText } from "../utils/text-util.ts";
import type { KafkaClient } from "./kafka-client.ts";
import { KafkaLogQueue, type KafkaLogBatchSender } from "./kafka-log-queue.ts";

const ERROR_REPORT_GAP_MS = 30_000;

/** Longest wait for the last flush on stop (Kafka down must not block a container stop). */
const STOP_FLUSH_TIMEOUT_MS = 5_000;

export class KafkaLogSink implements LogSink {
  private readonly config: KafkaLogConfig;

  private readonly client: KafkaClient | null;

  private readonly sendBatch: KafkaLogBatchSender;

  private queue: KafkaLogQueue | null = null;

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private lastErrorReportAt = 0;

  /** target: the KafkaClient of the service, or a batch sender (tests). */
  constructor(config: KafkaLogConfig, target: KafkaClient | KafkaLogBatchSender) {
    this.config = config;
    if (typeof target === "function") {
      this.client = null;
      this.sendBatch = target;
      return;
    }
    this.client = target;
    this.sendBatch = target.sendBatch.bind(target);
  }

  /** True while started. */
  get isStarted(): boolean {
    return this.queue !== null;
  }

  /** Entries waiting to be sent. */
  get waitingCount(): number {
    return this.queue?.size ?? 0;
  }

  /** Starts the sink and makes it the log sink of every logger; false when config.isEnabled is false. */
  async start(): Promise<boolean> {
    if (this.queue !== null) {
      return true;
    }
    if (!this.config.isEnabled) {
      return false;
    }
    this.queue = new KafkaLogQueue({
      topicPattern: this.config.topic,
      batchSize: this.config.batchSize,
      maxSize: this.config.queueMax,
      send: this.sendBatch,
    });
    const onTimer = this.flush.bind(this);
    this.flushTimer = setInterval(onTimer, this.config.flushMs);
    this.flushTimer.unref();
    setLogSink(this);
    if (this.client !== null) {
      // Not awaited: kafkajs retries for seconds when Kafka is down, and the service must start anyway.
      void this.connectClient();
    }
    return true;
  }

  private async connectClient(): Promise<void> {
    try {
      await this.client?.connectProducer();
    } catch (error) {
      this.reportError("Kafka log producer connect failed, logs are queued and sent when Kafka is back", error);
    }
  }

  /** Queues one entry (sends at once when a batch is full). */
  send(entry: LogEntry): void {
    const queue = this.queue;
    if (queue === null) {
      return;
    }
    queue.push(entry);
    if (queue.isBatchReady) {
      void this.flush();
    }
  }

  /** Sends every queued entry now (errors are reported, never thrown). */
  async flush(): Promise<void> {
    const queue = this.queue;
    if (queue === null) {
      return;
    }
    try {
      await queue.flush();
    } catch (error) {
      this.reportError("Kafka log send failed", error);
    }
  }

  /** Stops the sink: last flush (at most 5 seconds), then disconnects the producer. */
  async stop(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    const flushPromise = this.flush();
    const timeoutPromise = Bun.sleep(STOP_FLUSH_TIMEOUT_MS);
    await Promise.race([flushPromise, timeoutPromise]);
    this.queue = null;
    setLogSink(null);
    if (this.client === null) {
      return;
    }
    try {
      await this.client.disconnectProducer();
    } catch (error) {
      this.reportError("Kafka log producer disconnect failed", error);
    }
  }

  /** Writes a Kafka problem to the console (not to Kafka), at most once per 30 seconds. */
  private reportError(message: string, error: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorReportAt < ERROR_REPORT_GAP_MS) {
      return;
    }
    this.lastErrorReportAt = now;
    const errorText = readErrorText(error);
    const timestamp = new Date();
    const entry = {
      level: "error",
      message,
      error: errorText,
      dropped: this.queue?.droppedCount ?? 0,
      waiting: this.waitingCount,
      timestamp,
    };
    const line = JSON.stringify(entry);
    console.error(line);
  }
}
