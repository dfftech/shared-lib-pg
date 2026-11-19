// config-parse.test.ts — environment text becomes typed config values; unset / empty / bad text gives the fallback.
import { describe, expect, it } from "bun:test";
import { buildDefaultConfig, mergeAppConfig, parseBoolean, parseKafkaSasl, parseList, parseLogLevel, parseNumber, parseText } from "../src/index.ts";

function testText(): void {
  expect(parseText("  value  ", "x")).toBe("value");
  expect(parseText("   ", "x")).toBe("x");
  expect(parseText(undefined, "x")).toBe("x");
}

function testNumber(): void {
  expect(parseNumber("42", 1)).toBe(42);
  expect(parseNumber("forty", 1)).toBe(1);
  expect(parseNumber("", 1)).toBe(1);
  expect(parseNumber(undefined, 1)).toBe(1);
}

function testBoolean(): void {
  expect(parseBoolean("YES", false)).toBe(true);
  expect(parseBoolean("1", false)).toBe(true);
  expect(parseBoolean("off", true)).toBe(false);
  expect(parseBoolean("maybe", true)).toBe(true);
  expect(parseBoolean(undefined, false)).toBe(false);
}

function testList(): void {
  expect(parseList("a:1, b:2 | c:3", [])).toEqual(["a:1", "b:2", "c:3"]);
  expect(parseList("", ["x"])).toEqual(["x"]);
  expect(parseList(undefined, [])).toEqual([]);
}

function testLogLevel(): void {
  expect(parseLogLevel("DEBUG", "info")).toBe("debug");
  expect(parseLogLevel("loud", "info")).toBe("info");
}

function testKafkaSasl(): void {
  expect(parseKafkaSasl(undefined, "pw", "plain")).toBeUndefined();
  expect(parseKafkaSasl("admin", "pw", "SCRAM-SHA-512")).toEqual({ mechanism: "scram-sha-512", username: "admin", password: "pw" });
  expect(parseKafkaSasl("admin", undefined, "kerberos")).toEqual({ mechanism: "plain", username: "admin", password: "" });
}

function testMerge(): void {
  const base = buildDefaultConfig();
  const merged = mergeAppConfig(base, { db: { poolSize: 3 }, kafka: { log: { topic: "x" } } });
  expect(merged.db.poolSize).toBe(3);
  expect(merged.db.idleTimeoutMs).toBe(base.db.idleTimeoutMs);
  expect(merged.kafka.log.topic).toBe("x");
  expect(merged.kafka.log.flushMs).toBe(base.kafka.log.flushMs);
  expect(base.db.poolSize).toBe(10);
}

describe("config parsers", () => {
  it("parseText trims and falls back", testText);
  it("parseNumber", testNumber);
  it("parseBoolean", testBoolean);
  it("parseList", testList);
  it("parseLogLevel", testLogLevel);
  it("parseKafkaSasl: off without a username, known mechanisms only", testKafkaSasl);
  it("mergeAppConfig changes only the given values", testMerge);
});
