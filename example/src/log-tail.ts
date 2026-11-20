// log-tail.ts
// Prints the Kafka logs of the service as they arrive, one line per entry: [tenant] level message.
//   bun run logs                 -> the config kafka.log.topic ("app-logs", or every "app-logs-{tenant}" topic)
//   bun run logs app-logs-acme   -> one topic
// Uses a new consumer group each run and starts at the newest message. Kafka settings come from config.ts.

import { KafkaClient, type KafkaInboundMessage } from "shared-lib-pg";
import { appConfig } from "./config.ts";

const TENANT_PLACEHOLDER = "{tenant}";

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Topic or RegExp to read: the argument, else the config log topic ("{tenant}" -> every tenant topic). */
export function readTailTopic(): string | RegExp {
  const argumentTopic = process.argv[2];
  if (argumentTopic !== undefined) {
    return argumentTopic;
  }
  const topicPattern = appConfig.kafka.log.topic;
  const hasPlaceholder = topicPattern.includes(TENANT_PLACEHOLDER);
  if (!hasPlaceholder) {
    return topicPattern;
  }
  const parts = topicPattern.split(TENANT_PLACEHOLDER);
  const escapedParts: string[] = [];
  for (const part of parts) {
    const escapedPart = part.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");
    escapedParts.push(escapedPart);
  }
  const source = escapedParts.join(".+");
  return new RegExp(`^${source}$`);
}

/** Prints one log message. */
export async function printLogMessage(message: KafkaInboundMessage): Promise<void> {
  if (message.value === null) {
    return;
  }
  try {
    const entry = JSON.parse(message.value) as Record<string, unknown>;
    const tenant = entry.tenant_id ?? "-";
    const level = String(entry.level ?? "info");
    const upperLevel = level.toUpperCase();
    console.log(`[${tenant}] ${upperLevel} ${entry.message} (${entry.service}, ${entry.request_id}, topic ${message.topic})`);
  } catch {
    console.log(`[${message.key ?? "-"}] ${message.value}`);
  }
}

const topic = readTailTopic();

const groupId = `log-tail-${crypto.randomUUID()}`;

const kafka = new KafkaClient(appConfig.kafka);

await kafka.startConsumer({ topic, groupId, onMessage: printLogMessage });

console.log(`Reading logs from ${String(topic)} ...`);
