// fake-kafka.ts
// Kafka log sender for tests: keeps every batch in memory instead of sending it.

import type { TopicMessages } from "kafkajs";

export type SentLog = {
  topic: string;
  key: string | null;
  entry: Record<string, unknown>;
};

export class FakeKafkaSender {
  readonly batches: TopicMessages[][] = [];

  failNextCount = 0;

  /** Bound send function for startKafkaLogger({ send }) / KafkaLogQueue. */
  readonly send = this.sendBatch.bind(this);

  async sendBatch(topicMessages: TopicMessages[]): Promise<void> {
    if (this.failNextCount > 0) {
      this.failNextCount -= 1;
      throw new Error("Kafka is down");
    }
    this.batches.push(topicMessages);
  }

  /** Every sent message as { topic, key, entry }. */
  readSentLogs(): SentLog[] {
    const sentLogs: SentLog[] = [];
    for (const batch of this.batches) {
      for (const topicMessage of batch) {
        for (const message of topicMessage.messages) {
          const key = message.key === undefined || message.key === null ? null : String(message.key);
          const entry = JSON.parse(String(message.value)) as Record<string, unknown>;
          sentLogs.push({ topic: topicMessage.topic, key, entry });
        }
      }
    }
    return sentLogs;
  }

  clear(): void {
    this.batches.length = 0;
  }
}
