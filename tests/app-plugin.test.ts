// app-plugin.test.ts — request context, reply meta, error replies, auth and Kafka logs of appPlugin().
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { SessionInfo } from "dff-util";
import { Elysia, t } from "elysia";
import {
  AppError,
  JwtService,
  KafkaLogSink,
  appPlugin,
  authPlugin,
  readBranchId,
  readLogger,
  readRequestId,
  readSessionUser,
  readTenantId,
  type RequestContextProps,
} from "../src/index.ts";
import { FakeKafkaSender } from "./fake-kafka.ts";
import { muteConsole, restoreConsole } from "./quiet-console.ts";
import { restoreTestConfig, useTestConfig } from "./test-config.ts";

type Reply = Record<string, any>;

const sender = new FakeKafkaSender();

const logSink = new KafkaLogSink({ isEnabled: true, topic: "logs-{tenant}", flushMs: 60_000, batchSize: 10_000, queueMax: 10_000 }, sender.send);

async function handleEcho(context: RequestContextProps): Promise<Reply> {
  await Bun.sleep(1);
  return {
    data: {
      requestId: readRequestId(),
      tenantId: readTenantId(),
      branchId: readBranchId(),
      userId: readSessionUser().id,
      contextRequestId: context.requestId,
    },
    meta: { source: "handler" },
  };
}

function handleRejected(): never {
  throw new AppError("INVALID_ADDRESS");
}

function handleCrash(): never {
  throw new Error("database exploded");
}

function handleQueryFailure(): never {
  const cause = new Error('relation "audit_logs" does not exist');
  throw new Error("Failed query: insert into audit_logs (email) values ($1)\nparams: a@b.c", { cause });
}

function handleList(): number[] {
  return [1, 2, 3];
}

function handleBody(context: { body: { name: string } }): Reply {
  return { data: context.body };
}

function handleLog(): Reply {
  const logger = readLogger();
  logger.info("Saved profile", { email: "a@b.c", id: 7 });
  return { data: true };
}

function handleSecure(context: { sessionUser: SessionInfo }): Reply {
  return { data: { id: context.sessionUser.id } };
}

const secureApi = new Elysia().use(authPlugin({ roles: ["ADMIN"] })).get("/secure", handleSecure);

const app = new Elysia()
  .use(appPlugin())
  .get("/echo", handleEcho)
  .get("/rejected", handleRejected)
  .get("/crash", handleCrash)
  .get("/query-failure", handleQueryFailure)
  .get("/list", handleList)
  .get("/log", handleLog)
  .post("/body", { body: t.Object({ name: t.String() }) }, handleBody)
  .use(secureApi);

async function call(path: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<{ status: number; body: Reply; headers: Headers }> {
  const request = new Request(`http://localhost${path}`, { ...init, headers });
  const response = await app.handle(request);
  const text = await response.text();
  const body = text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : { text };
  return { status: response.status, body, headers: response.headers };
}

async function startLogs(): Promise<void> {
  useTestConfig({ log: { level: "info" } });
  muteConsole();
  await logSink.start();
}

async function stopLogs(): Promise<void> {
  await logSink.stop();
  restoreConsole();
  restoreTestConfig();
}

async function testContextAndMeta(): Promise<void> {
  const token = JwtService.GenerateToken({ id: "user-1", roles: [] });
  const reply = await call("/echo", { "request-id": "r-1", "x-tenant-id": "acme", "x-branch-id": "b-9", authorization: `Bearer ${token}` });
  expect(reply.status).toBe(200);
  expect(reply.body.data).toEqual({ requestId: "r-1", tenantId: "acme", branchId: "b-9", userId: "user-1", contextRequestId: "r-1" });
  expect(reply.body.meta.requestId).toBe("r-1");
  expect(reply.body.meta.source).toBe("handler");
  expect(typeof reply.body.meta.duration).toBe("number");
  expect(reply.headers.get("request-id")).toBe("r-1");
  expect(reply.headers.get("session-user-id")).toBe("user-1");
}

async function testGeneratedRequestId(): Promise<void> {
  const reply = await call("/echo");
  expect(reply.body.data.requestId.length).toBe(36);
  expect(reply.body.data.userId).toBe("unknown");
  expect(reply.body.data.tenantId).toBeUndefined();
}

async function testAppError(): Promise<void> {
  const reply = await call("/rejected", { "request-id": "r-2" });
  expect(reply.status).toBe(200);
  expect(reply.body.data).toBeNull();
  expect(reply.body.error).toBe("INVALID_ADDRESS");
  expect(reply.body.meta.requestId).toBe("r-2");
  expect(reply.headers.get("request-id")).toBe("r-2");
}

async function testUnknownError(): Promise<void> {
  const reply = await call("/crash");
  expect(reply.status).toBe(500);
  expect(reply.body.error).toBe("unknown");
  expect(reply.body.message).toBe("database exploded");
}

async function testQueryFailureHidesSql(): Promise<void> {
  const reply = await call("/query-failure");
  expect(reply.status).toBe(500);
  expect(reply.body.message).toBe('relation "audit_logs" does not exist');
  expect(JSON.stringify(reply.body).includes("a@b.c")).toBe(false);
}

async function testValidationAndNotFound(): Promise<void> {
  const invalid = await call("/body", { "content-type": "application/json" }, { method: "POST", body: "{}" });
  expect(invalid.status).toBe(422);
  expect(invalid.body.error).toBe("INVALID_DATA");
  expect(invalid.body.details.length).toBeGreaterThan(0);
  const badJson = await call("/body", { "content-type": "application/json" }, { method: "POST", body: "{bad" });
  expect(badJson.status).toBe(400);
  expect(badJson.body.error).toBe("INVALID_DATA");
  const missing = await call("/missing");
  expect(missing.status).toBe(404);
  expect(missing.body.error).toBe("NOT_FOUND");
}

async function testNonObjectReply(): Promise<void> {
  const reply = await call("/list");
  expect(reply.body).toEqual([1, 2, 3]);
}

async function testAuth(): Promise<void> {
  const noToken = await call("/secure");
  expect(noToken.status).toBe(401);
  expect(noToken.body.error).toBe("UNAUTHORIZED");
  const userToken = JwtService.GenerateToken({ id: "user-2", roles: ["USER"] });
  const noRole = await call("/secure", { authorization: `Bearer ${userToken}` });
  expect(noRole.status).toBe(403);
  expect(noRole.body.error).toBe("FORBIDDEN");
  const adminToken = JwtService.GenerateToken({ id: "admin-1", roles: ["ADMIN"] });
  const allowed = await call("/secure", { authorization: `Bearer ${adminToken}` });
  expect(allowed.status).toBe(200);
  expect(allowed.body.data.id).toBe("admin-1");
  const otherSecret = adminToken.slice(0, -2) + "xx";
  const forged = await call("/secure", { authorization: `Bearer ${otherSecret}` });
  expect(forged.status).toBe(401);
}

async function testKafkaLogs(): Promise<void> {
  sender.clear();
  await call("/log", { "request-id": "r-log", "x-tenant-id": "acme" });
  await Bun.sleep(5);
  await logSink.flush();
  const sent = sender.readSentLogs();
  const messages: string[] = [];
  for (const log of sent) {
    if (log.entry.request_id === "r-log") {
      expect(log.topic).toBe("logs-acme");
      expect(log.key).toBe("acme");
      expect(log.entry.tenant_id).toBe("acme");
      expect(log.entry.service).toBe("test");
      messages.push(String(log.entry.message));
    }
    if (log.entry.message === "Saved profile") {
      expect(log.entry.email).toBe("xxx-xxx-xxxx");
      expect(log.entry.id).toBe(7);
    }
  }
  expect(messages).toEqual(["Request started", "Saved profile", "Request completed"]);
}

async function testConcurrentRequests(): Promise<void> {
  sender.clear();
  const calls: Array<Promise<{ status: number; body: Reply; headers: Headers }>> = [];
  for (let index = 0; index < 40; index += 1) {
    const headers = { "request-id": `c-${index}`, "x-tenant-id": `tenant-${index % 4}` };
    const replyPromise = call("/echo", headers);
    calls.push(replyPromise);
  }
  const replies = await Promise.all(calls);
  for (let index = 0; index < replies.length; index += 1) {
    const reply = replies[index];
    expect(reply?.body.data.requestId).toBe(`c-${index}`);
    expect(reply?.body.data.tenantId).toBe(`tenant-${index % 4}`);
  }
  await Bun.sleep(5);
  await logSink.flush();
  for (const log of sender.readSentLogs()) {
    const requestNumber = Number(String(log.entry.request_id).slice(2));
    expect(log.key).toBe(`tenant-${requestNumber % 4}`);
    expect(log.topic).toBe(`logs-tenant-${requestNumber % 4}`);
  }
}

describe("appPlugin", () => {
  beforeAll(startLogs);
  afterAll(stopLogs);
  it("gives handlers the request context and adds meta + headers", testContextAndMeta);
  it("creates a request id and an unknown user without headers", testGeneratedRequestId);
  it("AppError -> 200 { data: null, error }", testAppError);
  it("unknown error -> 500 { error: unknown, message }", testUnknownError);
  it("a failed query replies with the PostgreSQL message, not SQL or params", testQueryFailureHidesSql);
  it("validation 422, bad JSON 400, unknown route 404", testValidationAndNotFound);
  it("leaves non-object replies unchanged", testNonObjectReply);
  it("authPlugin checks token and roles", testAuth);
  it("sends request logs to the tenant topic with the tenant key, masked", testKafkaLogs);
  it("keeps the context of concurrent requests apart", testConcurrentRequests);
});
