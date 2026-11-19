// kafka-log-queue.test.ts — multi-tenant topics and keys, batching, drop-oldest and retry after a failed send.
import { describe, expect, it } from "bun:test";
import { KafkaLogQueue, resolveLogTopic, toTopicPart, type LogEntry } from "../src/index.ts";
import { FakeKafkaSender } from "./fake-kafka.ts";

function buildEntry(message: string, tenantId?: string): LogEntry {
  const entry: LogEntry = { level: "info", message, timestamp: "2026-01-01T00:00:00.000Z" };
  if (tenantId !== undefined) {
    entry.tenant_id = tenantId;
  }
  return entry;
}

function testTopicNames(): void {
  expect(resolveLogTopic("app-logs", "acme")).toBe("app-logs");
  expect(resolveLogTopic("app-logs-{tenant}", "acme")).toBe("app-logs-acme");
  expect(resolveLogTopic("app-logs-{tenant}", undefined)).toBe("app-logs-core");
  expect(toTopicPart("acme corp/eu")).toBe("acme_corp_eu");
  expect(toTopicPart("")).toBe("core");
}

async function testSharedTopicWithTenantKey(): Promise<void> {
  const sender = new FakeKafkaSender();
  const queue = new KafkaLogQueue({ topicPattern: "app-logs", batchSize: 10, maxSize: 100, send: sender.send });
  queue.push(buildEntry("a1", "acme"));
  queue.push(buildEntry("g1", "globex"));
  queue.push(buildEntry("startup"));
  await queue.flush();
  const sent = sender.readSentLogs();
  expect(sent.length).toBe(3);
  expect(sent[0]).toEqual({ topic: "app-logs", key: "acme", entry: buildEntry("a1", "acme") });
  expect(sent[1]?.key).toBe("globex");
  expect(sent[2]?.key).toBeNull();
  expect(queue.size).toBe(0);
}

async function testTopicPerTenant(): Promise<void> {
  const sender = new FakeKafkaSender();
  const queue = new KafkaLogQueue({ topicPattern: "logs-{tenant}", batchSize: 2, maxSize: 100, send: sender.send });
  queue.push(buildEntry("a1", "acme"));
  queue.push(buildEntry("g1", "globex"));
  queue.push(buildEntry("a2", "acme"));
  await queue.flush();
  expect(sender.batches.length).toBe(2);
  const sent = sender.readSentLogs();
  const acmeMessages: string[] = [];
  for (const log of sent) {
    if (log.topic === "logs-acme") {
      acmeMessages.push(String(log.entry.message));
    }
  }
  expect(acmeMessages).toEqual(["a1", "a2"]);
}

function testDropOldest(): void {
  const sender = new FakeKafkaSender();
  const queue = new KafkaLogQueue({ topicPattern: "app-logs", batchSize: 10, maxSize: 2, send: sender.send });
  queue.push(buildEntry("1"));
  queue.push(buildEntry("2"));
  queue.push(buildEntry("3"));
  expect(queue.size).toBe(2);
  expect(queue.droppedCount).toBe(1);
}

async function testRetryAfterFailure(): Promise<void> {
  const sender = new FakeKafkaSender();
  const queue = new KafkaLogQueue({ topicPattern: "app-logs", batchSize: 10, maxSize: 100, send: sender.send });
  queue.push(buildEntry("kept", "acme"));
  sender.failNextCount = 1;
  let failure: unknown;
  try {
    await queue.flush();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(queue.size).toBe(1);
  await queue.flush();
  const sent = sender.readSentLogs();
  expect(sent[0]?.entry.message).toBe("kept");
}

describe("KafkaLogQueue", () => {
  it("resolves the topic per tenant and makes safe names", testTopicNames);
  it("shared topic: tenant id is the message key", testSharedTopicWithTenantKey);
  it("topic per tenant keeps the order inside a tenant", testTopicPerTenant);
  it("drops the oldest entries when full", testDropOldest);
  it("keeps a failed batch and sends it on the next flush", testRetryAfterFailure);
});
