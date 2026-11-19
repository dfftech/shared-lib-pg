// kafka-client.ts
// Kafka connection of a service (kafkajs), built from the config (kafka: brokers, clientId, isSsl, sasl).
// Application creates one (application.kafka); the log sink and app events share its producer.
//   await application.kafka.publish("order-events", tenantId, { id, status });
//   const consumer = await application.kafka.startConsumer({ topic: "order-events", groupId: "billing", onMessage });

import {
  Kafka,
  Partitioners,
  logLevel,
  type Consumer,
  type EachMessagePayload,
  type KafkaConfig as KafkaJsConfig,
  type Producer,
  type SASLOptions,
  type TopicMessages,
} from "kafkajs";
import type { KafkaConfig, KafkaSaslConfig } from "../config/app-config.ts";

export type KafkaInboundMessage = {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string>;
};

export type KafkaMessageHandler = (message: KafkaInboundMessage) => Promise<void>;

export type KafkaConsumerOptions = {
  /** One topic, or a RegExp for several (e.g. /^app-logs-.+/ for the log topics of every tenant). */
  topic: string | RegExp;
  groupId: string;
  onMessage: KafkaMessageHandler;
  isFromBeginning?: boolean;
};

function readHeaderRecord(payload: EachMessagePayload): Record<string, string> {
  const headers: Record<string, string> = {};
  const rawHeaders = payload.message.headers ?? {};
  const entries = Object.entries(rawHeaders);
  for (const [name, value] of entries) {
    if (value === undefined) {
      continue;
    }
    headers[name] = String(value);
  }
  return headers;
}

/** Plain message for a consumer handler: key and value as text. */
export function toInboundMessage(payload: EachMessagePayload): KafkaInboundMessage {
  const message = payload.message;
  const key = message.key === null ? null : message.key.toString();
  const value = message.value === null ? null : message.value.toString();
  const headers = readHeaderRecord(payload);
  return { topic: payload.topic, partition: payload.partition, offset: message.offset, key, value, headers };
}

/** kafkajs SASL options of the config (one object type per mechanism). */
export function toSaslOptions(sasl: KafkaSaslConfig): SASLOptions {
  if (sasl.mechanism === "scram-sha-256") {
    return { mechanism: "scram-sha-256", username: sasl.username, password: sasl.password };
  }
  if (sasl.mechanism === "scram-sha-512") {
    return { mechanism: "scram-sha-512", username: sasl.username, password: sasl.password };
  }
  return { mechanism: "plain", username: sasl.username, password: sasl.password };
}

async function handleEachMessage(onMessage: KafkaMessageHandler, payload: EachMessagePayload): Promise<void> {
  const inboundMessage = toInboundMessage(payload);
  await onMessage(inboundMessage);
}

export class KafkaClient {
  private readonly config: KafkaConfig;

  private client: Kafka | null = null;

  private producer: Producer | null = null;

  private producerPromise: Promise<Producer> | null = null;

  constructor(config: KafkaConfig) {
    this.config = config;
  }

  /** kafkajs settings of the config. */
  toKafkaJsConfig(): KafkaJsConfig {
    const kafkaJsConfig: KafkaJsConfig = {
      clientId: this.config.clientId,
      brokers: this.config.brokers,
      ssl: this.config.isSsl,
      logLevel: logLevel.WARN,
    };
    if (this.config.sasl !== undefined) {
      kafkaJsConfig.sasl = toSaslOptions(this.config.sasl);
    }
    return kafkaJsConfig;
  }

  /** The kafkajs client (created on first use). */
  readClient(): Kafka {
    if (this.client === null) {
      const kafkaJsConfig = this.toKafkaJsConfig();
      this.client = new Kafka(kafkaJsConfig);
    }
    return this.client;
  }

  private async openProducer(): Promise<Producer> {
    const client = this.readClient();
    const producer = client.producer({ createPartitioner: Partitioners.DefaultPartitioner, allowAutoTopicCreation: true });
    try {
      await producer.connect();
    } catch (error) {
      this.producerPromise = null;
      throw error;
    }
    this.producer = producer;
    return producer;
  }

  /** The shared producer, connected (one connect at a time; after a failure the next call tries again). */
  connectProducer(): Promise<Producer> {
    if (this.producerPromise === null) {
      this.producerPromise = this.openProducer();
    }
    return this.producerPromise;
  }

  /** Disconnects the shared producer. */
  async disconnectProducer(): Promise<void> {
    const producer = this.producer;
    this.producer = null;
    this.producerPromise = null;
    if (producer !== null) {
      await producer.disconnect();
    }
  }

  /** Sends one message; objects as JSON. The key keeps the messages of one key (tenant, id) in order. */
  async publish(topic: string, key: string | null, message: unknown): Promise<void> {
    const producer = await this.connectProducer();
    const value = typeof message === "string" ? message : JSON.stringify(message);
    const kafkaMessage = key === null || key === "" ? { value } : { key, value };
    await producer.send({ topic, messages: [kafkaMessage] });
  }

  /** Sends batches of messages for several topics in one call. */
  async sendBatch(topicMessages: TopicMessages[]): Promise<void> {
    const producer = await this.connectProducer();
    await producer.sendBatch({ topicMessages });
  }

  /** Starts a consumer group; call consumer.disconnect() to stop it. */
  async startConsumer(options: KafkaConsumerOptions): Promise<Consumer> {
    const client = this.readClient();
    const consumer = client.consumer({ groupId: options.groupId });
    await consumer.connect();
    const isFromBeginning = options.isFromBeginning ?? false;
    await consumer.subscribe({ topic: options.topic, fromBeginning: isFromBeginning });
    const eachMessage = handleEachMessage.bind(null, options.onMessage);
    await consumer.run({ eachMessage });
    return consumer;
  }
}
