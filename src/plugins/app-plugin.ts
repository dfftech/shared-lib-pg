// app-plugin.ts
// Base plugin of every service (the Encore LoggingMiddleware for Elysia). Use it once, first:
//   const app = new Elysia().use(appPlugin()).use(healthApi).use(addressApi);
// For every request it:
//   1. runs the request inside AsyncLocalStorage (RequestContext), so services read it anywhere
//   2. reads request-id, x-tenant-id, x-branch-id, the trace id and the bearer token (session user decoded)
//   3. logs "Request started" / "Request completed" (console + Kafka) with tenant, branch, user and duration
//   4. adds meta { requestId, timestamp, duration } to every object reply, and request-id / session-user-id headers
//   5. turns errors into ResponseType replies (error-response.ts); handlers need no try / catch
// Handlers also get { requestId, tenantId, branchId, sessionUser, logger } in their context.
// Config log.isResponseLogged adds the (masked) reply to "Request completed". Application uses it for you.

import { Elysia, status as elysiaStatus, type HTTPHeaders } from "elysia";
import type { SessionInfo } from "../app-types.ts";
import { readAppConfig } from "../config/app-config.ts";
import {
  BRANCH_HEADER,
  REQUEST_ID_HEADER,
  SESSION_USER_HEADER,
  TENANT_HEADER,
  readBearerToken,
  readHeaderText,
  readRequestIdHeader,
  readTraceIdHeader,
} from "../context/request-headers.ts";
import { RequestContext, buildUnknownSessionUser, requestStorage } from "../context/request-context.ts";
import { JwtService } from "../jwt/jwt-service.ts";
import type { AppLogger } from "../logging/log-types.ts";
import { readErrorLogData, toErrorReply } from "./error-response.ts";

export type AppPluginOptions = {
  /** Add the reply body to the "Request completed" log (default: config log.isResponseLogged). */
  isResponseLogged?: boolean;
};

type AppPluginSettings = {
  isResponseLogged: boolean;
};

type FetchFunction = (request: Request, ...rest: any[]) => Response | Promise<Response>;

type HeaderSetter = {
  set: { headers: HTTPHeaders; status?: number | string };
};

type ResponseMeta = {
  requestId: string;
  timestamp: string;
  duration: number;
};

export type RequestContextProps = {
  requestId: string;
  tenantId: string | undefined;
  branchId: string | undefined;
  sessionUser: SessionInfo;
  logger: AppLogger;
};

export const APP_PLUGIN_NAME = "shared-lib-pg/app";

function readRequestPath(request: Request): string {
  const url = new URL(request.url);
  return url.pathname;
}

function readRequestPathAndQuery(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

/** RequestContext from the request headers. */
export function createRequestContext(request: Request): RequestContext {
  const headers = request.headers;
  const token = readBearerToken(headers);
  const sessionUser = JwtService.TryDecodeToken(token) ?? buildUnknownSessionUser();
  return new RequestContext({
    requestId: readRequestIdHeader(headers),
    method: request.method,
    path: readRequestPath(request),
    pathAndQuery: readRequestPathAndQuery(request),
    traceId: readTraceIdHeader(headers),
    tenantId: readHeaderText(headers, TENANT_HEADER),
    branchId: readHeaderText(headers, BRANCH_HEADER),
    token,
    sessionUser,
  });
}

function runFetchInContext(fetch: FetchFunction, request: Request, ...rest: any[]): Response | Promise<Response> {
  const context = createRequestContext(request);
  return requestStorage.run(context, fetch, request, ...rest);
}

function wrapFetch(fetch: FetchFunction): FetchFunction {
  return runFetchInContext.bind(null, fetch);
}

function setContextHeaders(headers: HTTPHeaders, context: RequestContext): void {
  headers[REQUEST_ID_HEADER] = context.requestId;
  headers[SESSION_USER_HEADER] = context.sessionUser.id;
}

function startRequest(routeContext: HeaderSetter): void {
  const context = requestStorage.getStore();
  if (context === undefined) {
    return;
  }
  setContextHeaders(routeContext.set.headers, context);
  context.logger.info("Request started", { method: context.method, path: context.path });
}

function deriveRequestContext(): RequestContextProps {
  const context = requestStorage.getStore();
  if (context === undefined) {
    throw new Error("REQUEST_CONTEXT_REQUIRED: appPlugin() must wrap the app fetch");
  }
  return {
    requestId: context.requestId,
    tenantId: context.tenantId,
    branchId: context.branchId,
    sessionUser: context.sessionUser,
    logger: context.logger,
  };
}

/** True for a plain object reply ({ data, ... }), not for arrays, Response, files or status objects. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** meta of a reply: request id, time and duration in milliseconds. */
export function buildResponseMeta(context: RequestContext): ResponseMeta {
  const now = new Date();
  return { requestId: context.requestId, timestamp: now.toISOString(), duration: context.durationMs };
}

function addMeta(reply: Record<string, unknown>, context: RequestContext): void {
  const meta = buildResponseMeta(context);
  const currentMeta = reply.meta;
  const handlerMeta = isPlainRecord(currentMeta) ? currentMeta : {};
  reply.meta = { ...meta, ...handlerMeta };
}

function addResponseMeta(routeContext: HeaderSetter & { responseValue: unknown }): void {
  const context = requestStorage.getStore();
  if (context === undefined) {
    return;
  }
  setContextHeaders(routeContext.set.headers, context);
  const reply = routeContext.responseValue;
  const isRecord = isPlainRecord(reply);
  if (isRecord) {
    addMeta(reply, context);
  }
}

function logRequestError(context: RequestContext, error: unknown, status: number, kind: string, code: unknown): void {
  if (kind === "server") {
    const errorData = readErrorLogData(error);
    context.logger.error("Request failed", { ...errorData, status });
    return;
  }
  const message = kind === "app" ? "Request rejected" : "Request invalid";
  context.logger.warn(message, { status, error_code: code });
}

/** Error reply via status(): Elysia 2.0 ignores set.status = 200 in onError, status(200, body) is kept. */
function handleRequestError(routeContext: HeaderSetter & { error: unknown }) {
  const reply = toErrorReply(routeContext.error);
  routeContext.set.status = reply.status;
  const body = reply.body as Record<string, unknown>;
  const context = requestStorage.getStore();
  if (context !== undefined) {
    setContextHeaders(routeContext.set.headers, context);
    logRequestError(context, routeContext.error, reply.status, reply.kind, reply.body.error);
    addMeta(body, context);
  }
  return elysiaStatus(reply.status, body);
}

function logRequestCompleted(settings: AppPluginSettings, routeContext: HeaderSetter & { responseValue?: unknown }): void {
  const context = requestStorage.getStore();
  if (context === undefined) {
    return;
  }
  const status = routeContext.set.status ?? 200;
  const data: Record<string, unknown> = { method: context.method, path: context.path, status, duration_ms: context.durationMs };
  if (settings.isResponseLogged) {
    data.response = routeContext.responseValue;
  }
  context.logger.info("Request completed", data);
}

/** The base plugin: request context, logs, reply meta and error replies (see the file header). */
export function appPlugin(options: AppPluginOptions = {}) {
  const config = readAppConfig();
  const isResponseLogged = options.isResponseLogged ?? config.log.isResponseLogged;
  const settings: AppPluginSettings = { isResponseLogged };
  const logCompleted = logRequestCompleted.bind(null, settings);
  return new Elysia({ name: APP_PLUGIN_NAME, seed: settings })
    .wrap(wrapFetch)
    .onRequest(startRequest)
    .derive("global", deriveRequestContext)
    .onAfterHandle("global", addResponseMeta)
    .onError("global", handleRequestError)
    .onAfterResponse("global", logCompleted);
}
