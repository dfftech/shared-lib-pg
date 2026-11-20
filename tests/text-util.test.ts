import { describe, expect, it } from "bun:test";
import { readErrorText } from "../src/index.ts";

function testErrorFields(): void {
  expect(readErrorText({ text: "service error" })).toBe("service error");
  expect(readErrorText({ message: "standard message" })).toBe("standard message");
  expect(readErrorText(new Error("Error instance message"))).toBe("Error instance message");
  expect(readErrorText({ text: "preferred text", message: "fallback message" })).toBe("preferred text");
  expect(readErrorText({ data: "response data" })).toBe("response data");
  expect(readErrorText({ data: { code: "FAILED" } })).toBe('{"code":"FAILED"}');
}

function testSerializationFallbacks(): void {
  expect(readErrorText({ code: "FAILED", retryable: false })).toBe('{"code":"FAILED","retryable":false}');
  expect(readErrorText("plain failure")).toBe('"plain failure"');
  const circularError: { self?: unknown } = {};
  circularError.self = circularError;
  expect(readErrorText(circularError)).toBe("[object Object]");
}

describe("readErrorText", () => {
  it("uses error text and message fields", testErrorFields);
  it("serializes other thrown values with a string fallback for circular values", testSerializationFallbacks);
});
