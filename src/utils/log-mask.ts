// log-mask.ts
// Hides personal data before a log is written (console and Kafka).
// A value is masked when its key matches the config log.maskKeys:
//   { email: "a@b.c", phoneNumber: "1", user_password: "x", tokens: ["t"] } -> every value "xxx-xxx-xxxx"
// A key matches when it is a mask key, has one as a word (camelCase, snake_case, kebab-case) or contains one.
// Errors become { name, message, stack } so they are not lost in JSON.

import { readAppConfig } from "../config/app-config.ts";

export const MASK_TEXT = "xxx-xxx-xxxx";

const KEY_SEPARATOR = /[-_]+/;

const KEY_SEPARATOR_ALL = /[_-]/g;

const CAMEL_WORD_BREAK = /([a-z0-9])([A-Z])/g;

let cachedRawKeys: string[] | null = null;

let cachedKeySet = new Set<string>();

function normalizeKey(key: string): string {
  const lowerKey = key.toLowerCase();
  return lowerKey.replace(KEY_SEPARATOR_ALL, "");
}

/** Normalized mask keys of the config (cached until the config list changes). */
export function readMaskKeySet(): Set<string> {
  const config = readAppConfig();
  const rawKeys = config.log.maskKeys;
  if (rawKeys === cachedRawKeys) {
    return cachedKeySet;
  }
  const keySet = new Set<string>();
  for (const rawKey of rawKeys) {
    const normalizedKey = normalizeKey(rawKey);
    if (normalizedKey !== "") {
      keySet.add(normalizedKey);
    }
  }
  cachedRawKeys = rawKeys;
  cachedKeySet = keySet;
  return keySet;
}

function readKeyWords(key: string): string[] {
  const spacedKey = key.replace(CAMEL_WORD_BREAK, "$1-$2");
  const parts = spacedKey.split(KEY_SEPARATOR);
  const words: string[] = [];
  for (const part of parts) {
    if (part !== "") {
      const word = part.toLowerCase();
      words.push(word);
    }
  }
  return words;
}

/** True when a log key holds personal data. */
export function isMaskedKey(key: string, keySet: Set<string>): boolean {
  const normalizedKey = normalizeKey(key);
  if (keySet.has(normalizedKey)) {
    return true;
  }
  const words = readKeyWords(key);
  for (const word of words) {
    if (keySet.has(word)) {
      return true;
    }
  }
  for (const maskKey of keySet) {
    if (normalizedKey.includes(maskKey)) {
      return true;
    }
  }
  return false;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function toErrorRecord(error: Error): Record<string, unknown> {
  const record: Record<string, unknown> = { name: error.name, message: error.message, stack: error.stack };
  const cause = error.cause;
  if (cause instanceof Error) {
    record.cause = cause.message;
  }
  return record;
}

function maskValue(value: unknown, keySet: Set<string>, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Error) {
    const errorRecord = toErrorRecord(value);
    return maskValue(errorRecord, keySet, seen);
  }
  if (seen.has(value)) {
    return MASK_TEXT;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const maskedItems: unknown[] = [];
    for (const item of value) {
      const maskedItem = maskValue(item, keySet, seen);
      maskedItems.push(maskedItem);
    }
    return maskedItems;
  }
  const maskedRecord: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [key, entryValue] of entries) {
    const isMasked = isMaskedKey(key, keySet);
    if (isMasked) {
      const isEmpty = isEmptyValue(entryValue);
      maskedRecord[key] = isEmpty ? entryValue : MASK_TEXT;
      continue;
    }
    maskedRecord[key] = maskValue(entryValue, keySet, seen);
  }
  return maskedRecord;
}

/** Copy of a log payload with personal values masked (config log.maskKeys). */
export function maskLogData<T>(data: T): T {
  if (data === null || typeof data !== "object") {
    return data;
  }
  const keySet = readMaskKeySet();
  const seen = new WeakSet<object>();
  return maskValue(data, keySet, seen) as T;
}
