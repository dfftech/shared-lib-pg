// kafka-log-queue.ts
// Keeps log entries in memory and sends them to Kafka in batches, so a request never waits for Kafka.
// Multi-tenant:
//   key   = tenant_id: all logs of one tenant stay in order on one partition
//   topic = the topic pattern; "{tenant}" in it is replaced:  "app-logs"          -> one shared topic
//                                                              "app-logs-{tenant}" -> "app-logs-acme"
// When Kafka is slow or down the queue keeps at most maxSize entries and drops the oldest.

import type { Message, TopicMessages } from "kafkajs";
import { toLogJson } from "../logging/log-json.ts";
import type { LogEntry } from "../logging/log-types.ts";

export type KafkaLogBatchSender = (topicMessages: TopicMessages[]) => Promise<void>;

export type KafkaLogQueueOptions = {
  topicPattern: string;
  batchSize: number;
  maxSize: number;
  send: KafkaLogBatchSender;
};

export const TENANT_TOPIC_PLACEHOLDER = "{tenant}";

/** Topic part used for logs without a tenant (startup, jobs of the base database). */
export const NO_TENANT_TOPIC_PART = "core";

const MAX_TOPIC_PART_LENGTH = 100;

const TOPIC_UNSAFE_CHARACTERS = /[^a-zA-Z0-9._-]/g;

/** Kafka topic name part from a tenant id: only [a-zA-Z0-9._-] and at most 100 characters. */
export function toTopicPart(tenantId?: string): string {
  const rawPart = tenantId ?? "";
  const safePart = rawPart.replace(TOPIC_UNSAFE_CHARACTERS, "_");
  const shortPart = safePart.slice(0, MAX_TOPIC_PART_LENGTH);
  return shortPart === "" ? NO_TENANT_TOPIC_PART : shortPart;
}

/** Log topic of a tenant: the pattern with "{tenant}" replaced (the pattern itself when it has none). */
export function resolveLogTopic(topicPattern: string, tenantId?: string): string {
  const hasPlaceholder = topicPattern.includes(TENANT_TOPIC_PLACEHOLDER);
  if (!hasPlaceholder) {
    return topicPattern;
  }
  const topicPart = toTopicPart(tenantId);
  return topicPattern.replaceAll(TENANT_TOPIC_PLACEHOLDER, topicPart);
}

/** Kafka message of a log entry: key = tenant id (none without a tenant), value = JSON. */
export function toLogMessage(entry: LogEntry): Message {
  const value = toLogJson(entry);
  const tenantId = entry.tenant_id;
  if (tenantId === undefined || tenantId === "") {
    return { value };
  }
  return { key: tenantId, value };
}

/** Groups entries by their topic, keeping the order inside each topic. */
export function groupLogsByTopic(entries: LogEntry[], topicPattern: string): TopicMessages[] {
  const messagesByTopic = new Map<string, Message[]>();
  for (const entry of entries) {
    const topic = resolveLogTopic(topicPattern, entry.tenant_id);
    let topicList = messagesByTopic.get(topic);
    if (topicList === undefined) {
      topicList = [];
      messagesByTopic.set(topic, topicList);
    }
    const message = toLogMessage(entry);
    topicList.push(message);
  }
  const topicMessages: TopicMessages[] = [];
  for (const [topic, messages] of messagesByTopic) {
    topicMessages.push({ topic, messages });
  }
  return topicMessages;
}

export class KafkaLogQueue {
  private readonly options: KafkaLogQueueOptions;

  private entries: LogEntry[] = [];

  private droppedTotal = 0;

  private flushPromise: Promise<void> | null = null;

  constructor(options: KafkaLogQueueOptions) {
    this.options = options;
  }

  /** Entries waiting to be sent. */
  get size(): number {
    return this.entries.length;
  }

  /** Entries dropped because the queue was full. */
  get droppedCount(): number {
    return this.droppedTotal;
  }

  /** True when a full batch is waiting (send now instead of waiting for the timer). */
  get isBatchReady(): boolean {
    return this.entries.length >= this.options.batchSize;
  }

  /** Adds an entry; drops the oldest when the queue is full. */
  push(entry: LogEntry): void {
    if (this.entries.length >= this.options.maxSize) {
      this.entries.shift();
      this.droppedTotal += 1;
    }
    this.entries.push(entry);
  }

  /** Sends every waiting entry in batches. One flush runs at a time; a failed batch goes back to the front. */
  async flush(): Promise<void> {
    if (this.flushPromise !== null) {
      await this.flushPromise;
      return;
    }
    this.flushPromise = this.sendAll();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async sendAll(): Promise<void> {
    while (this.entries.length > 0) {
      const batch = this.entries.splice(0, this.options.batchSize);
      const topicMessages = groupLogsByTopic(batch, this.options.topicPattern);
      try {
        await this.options.send(topicMessages);
      } catch (error) {
        this.putBack(batch);
        throw error;
      }
    }
  }

  private putBack(batch: LogEntry[]): void {
    const allEntries = batch.concat(this.entries);
    const overflow = allEntries.length - this.options.maxSize;
    if (overflow > 0) {
      allEntries.splice(0, overflow);
      this.droppedTotal += overflow;
    }
    this.entries = allEntries;
  }
}
