// config-parse.ts
// Turns environment text into typed config values for the app's config.ts, which reads process.env directly:
//   poolSize: parseNumber(process.env.CORE_DB_POOL_SIZE, 10),
//   isEnabled: parseBoolean(process.env.CORE_KAFKA_LOG_SEND, false),
// The helpers never read the environment themselves: unset or empty text gives the fallback.

import type { LogLevel } from "../logging/log-types.ts";
import type { KafkaSaslConfig, KafkaSaslMechanism } from "./app-config.ts";

const LIST_SEPARATOR = /[,|\s]+/;

const TRUE_TEXTS = new Set(["true", "1", "yes", "on"]);

const FALSE_TEXTS = new Set(["false", "0", "no", "off"]);

const LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

const SASL_MECHANISMS = new Set<string>(["plain", "scram-sha-256", "scram-sha-512"]);

function readTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

/** Trimmed text, or the fallback when unset or empty. */
export function parseText(value: string | undefined, fallback: string): string {
  return readTrimmed(value) ?? fallback;
}

/** Number, or the fallback when unset, empty or not a number. */
export function parseNumber(value: string | undefined, fallback: number): number {
  const text = readTrimmed(value);
  if (text === undefined) {
    return fallback;
  }
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

/** true / 1 / yes / on and false / 0 / no / off (any case), else the fallback. */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const text = readTrimmed(value);
  if (text === undefined) {
    return fallback;
  }
  const lowerText = text.toLowerCase();
  if (TRUE_TEXTS.has(lowerText)) {
    return true;
  }
  if (FALSE_TEXTS.has(lowerText)) {
    return false;
  }
  return fallback;
}

/** List split on "," "|" or spaces ("a, b c" -> ["a", "b", "c"]), or the fallback when unset or empty. */
export function parseList(value: string | undefined, fallback: string[]): string[] {
  const text = readTrimmed(value);
  if (text === undefined) {
    return fallback;
  }
  const parts = text.split(LIST_SEPARATOR);
  const items: string[] = [];
  for (const part of parts) {
    if (part !== "") {
      items.push(part);
    }
  }
  return items;
}

/** debug / info / warn / error (any case), else the fallback. */
export function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const text = readTrimmed(value);
  if (text === undefined) {
    return fallback;
  }
  const lowerText = text.toLowerCase();
  return LOG_LEVELS.has(lowerText) ? (lowerText as LogLevel) : fallback;
}

/** Kafka SASL settings, or undefined (SASL off) without a username; unknown mechanisms become "plain". */
export function parseKafkaSasl(
  username: string | undefined,
  password: string | undefined,
  mechanism: string | undefined,
): KafkaSaslConfig | undefined {
  const user = readTrimmed(username);
  if (user === undefined) {
    return undefined;
  }
  const mechanismText = parseText(mechanism, "plain");
  const lowerMechanism = mechanismText.toLowerCase();
  const isKnown = SASL_MECHANISMS.has(lowerMechanism);
  const saslMechanism = (isKnown ? lowerMechanism : "plain") as KafkaSaslMechanism;
  return { mechanism: saslMechanism, username: user, password: password ?? "" };
}
