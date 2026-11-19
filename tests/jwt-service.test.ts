// jwt-service.test.ts — tokens are signed with API_JWT_SECRET, verified, decoded and regenerated.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { JwtService, isJwtShape } from "../src/index.ts";
import { muteConsole, restoreConsole } from "./quiet-console.ts";
import { restoreTestConfig, useTestConfig } from "./test-config.ts";


function testRoundTrip(): void {
  const token = JwtService.GenerateToken({ id: "u1", roles: ["ADMIN"], tenant: "acme" });
  expect(isJwtShape(token)).toBe(true);
  const session = JwtService.VerifyToken(token);
  expect(session.id).toBe("u1");
  expect(session.roles).toEqual(["ADMIN"]);
  expect(session.tenant).toBe("acme");
  expect(session.key).toBe("API_JWT_KEY");
  expect(JwtService.IsValid(token)).toBe(true);
}

function testWrongSecret(): void {
  const token = JwtService.GenerateToken({ id: "u1", roles: [] });
  useTestConfig({ jwt: { secret: "another-secret" } });
  expect(() => JwtService.VerifyToken(token)).toThrow();
  expect(JwtService.TryDecodeToken(token)?.id).toBe("u1");
}

function testMissingSecret(): void {
  useTestConfig({ jwt: { secret: "" } });
  expect(() => JwtService.Secret()).toThrow(/jwt.secret/);
}

function testMaxAge(): void {
  const oldDate = new Date(Date.now() - 10_000);
  const token = JwtService.GenerateToken({ id: "u1", roles: [], createdAt: oldDate.toISOString() });
  useTestConfig({ jwt: { maxExpiresIn: 5 } });
  expect(() => JwtService.VerifyToken(token)).toThrow(/max token age/);
  expect(() => JwtService.RegenerateToken(token)).toThrow(/max token age/);
}

function testRegenerate(): void {
  const createdAt = new Date(Date.now() - 1000);
  const token = JwtService.GenerateToken({ id: "u1", roles: ["A"], createdAt: createdAt.toISOString() });
  const newToken = JwtService.RegenerateToken(token);
  const session = JwtService.VerifyToken(newToken);
  expect(session.createdAt).toBe(createdAt.toISOString());
}

function testTryDecodeBadInput(): void {
  expect(JwtService.TryDecodeToken(undefined)).toBeUndefined();
  expect(JwtService.TryDecodeToken("not-a-token")).toBeUndefined();
}

describe("JwtService", () => {
  beforeAll(muteConsole);
  afterAll(restoreConsole);
  afterEach(restoreTestConfig);
  it("signs and verifies a session", testRoundTrip);
  it("rejects a token of another secret, but still decodes it", testWrongSecret);
  it("has no default secret", testMissingSecret);
  it("rejects sessions older than jwt.maxExpiresIn", testMaxAge);
  it("regenerates and keeps createdAt", testRegenerate);
  it("TryDecodeToken returns undefined for bad input", testTryDecodeBadInput);
});
