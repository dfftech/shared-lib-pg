// log-mask.test.ts — personal values are masked by key (any case style), nested, in arrays and cycles.
import { afterEach, describe, expect, it } from "bun:test";
import { MASK_TEXT, maskLogData } from "../src/index.ts";
import { restoreTestConfig, useTestConfig } from "./test-config.ts";

function testDefaultKeys(): void {
  const data = {
    email: "a@b.c",
    userPhoneNumber: "555",
    user_password: "x",
    "x-auth-token": "t",
    Authorization: "Bearer abc",
    city: "Paris",
    empty_email: "",
  };
  const masked = maskLogData(data);
  expect(masked.email).toBe(MASK_TEXT);
  expect(masked.userPhoneNumber).toBe(MASK_TEXT);
  expect(masked.user_password).toBe(MASK_TEXT);
  expect(masked["x-auth-token"]).toBe(MASK_TEXT);
  expect(masked.Authorization).toBe(MASK_TEXT);
  expect(masked.city).toBe("Paris");
  expect(masked.empty_email).toBe("");
  expect(data.email).toBe("a@b.c");
}

function testNestedValues(): void {
  const masked = maskLogData({ user: { name: "Ann", emails: ["a@b.c"] }, rows: [{ mobile: "1" }, { id: 2 }] });
  expect(masked.user.name).toBe("Ann");
  expect(masked.user.emails as unknown).toBe(MASK_TEXT);
  expect(masked.rows[0]?.mobile).toBe(MASK_TEXT);
  expect(masked.rows[1]?.id).toBe(2);
}

function testCycleAndError(): void {
  const node: Record<string, unknown> = { id: 1 };
  node.self = node;
  const masked = maskLogData({ node, error: new Error("boom") }) as Record<string, any>;
  expect(masked.node.self).toBe(MASK_TEXT);
  expect(masked.error.message).toBe("boom");
  expect(masked.error.name).toBe("Error");
}

function testConfigKeys(): void {
  useTestConfig({ log: { maskKeys: ["iban"] } });
  const masked = maskLogData({ ibanNumber: "DE00", email: "a@b.c" });
  expect(masked.ibanNumber).toBe(MASK_TEXT);
  expect(masked.email).toBe("a@b.c");
}

describe("maskLogData", () => {
  afterEach(restoreTestConfig);
  it("masks the default keys in every case style", testDefaultKeys);
  it("masks nested values and whole masked arrays", testNestedValues);
  it("handles cycles and errors", testCycleAndError);
  it("uses the mask keys of the config", testConfigKeys);
});
