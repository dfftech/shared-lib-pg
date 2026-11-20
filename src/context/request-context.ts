// request-context.ts
// Context of the current request in AsyncLocalStorage (the Elysia version of Encore currentRequest()).
// appPlugin() creates it for every request; services read it anywhere without passing it on:
//   readRequestId()  readTenantId()  readBranchId()  readToken()  readSessionUser()  readLogger()  readSessionDb()
// Kafka consumers and jobs get the same context with runWithTenant() (tenant-task.ts).

import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionInfo } from "../app-types.ts";
import type { AppDatabase } from "../db/db-types.ts";
import { ContextLogger, appLogger } from "../logging/app-logger.ts";
import type { AppLogger, LogContext, LogContextReader } from "../logging/log-types.ts";
import { readTenantMode } from "./tenant-mode.ts";

/** Session user id when the request has no (readable) token. */
export const UNKNOWN_USER_ID = "unknown";

export type RequestContextFields = {
  requestId: string;
  method: string;
  path: string;
  pathAndQuery?: string;
  traceId?: string;
  tenantId?: string;
  branchId?: string;
  token?: string;
  sessionUser?: SessionInfo;
};

export type RequestDatabaseProvider = {
  core(): AppDatabase;
  forTenant(tenantId?: string): Promise<AppDatabase>;
  tenantIds(): string[];
};

/** Session of a request without a token. */
export function buildUnknownSessionUser(): SessionInfo {
  return { id: UNKNOWN_USER_ID, roles: [], key: "", createdAt: "" };
}

export class RequestContext implements LogContextReader {
  readonly requestId: string;

  readonly method: string;

  readonly path: string;

  readonly pathAndQuery: string;

  readonly startTime: number;

  readonly traceId: string | undefined;

  readonly branchId: string | undefined;

  readonly token: string | undefined;

  readonly logger: AppLogger;

  tenantId: string | undefined;

  sessionUser: SessionInfo;

  /** True after authPlugin() checked the token signature; a decoded-only token is false. */
  isSessionVerified = false;

  sessionDb: AppDatabase | undefined;

  database: RequestDatabaseProvider | undefined;

  constructor(fields: RequestContextFields) {
    this.requestId = fields.requestId;
    this.method = fields.method;
    this.path = fields.path;
    this.pathAndQuery = fields.pathAndQuery ?? fields.path;
    this.startTime = Date.now();
    this.traceId = fields.traceId;
    this.tenantId = fields.tenantId;
    this.branchId = fields.branchId;
    this.token = fields.token;
    this.sessionUser = fields.sessionUser ?? buildUnknownSessionUser();
    this.logger = new ContextLogger(this);
  }

  /** Milliseconds since the request started. */
  get durationMs(): number {
    return Date.now() - this.startTime;
  }

  readLogContext(): LogContext {
    const context: LogContext = { request_id: this.requestId, session_user_id: this.sessionUser.id };
    if (this.traceId !== undefined) {
      context.trace_id = this.traceId;
    }
    if (this.tenantId !== undefined && readTenantMode()) {
      context.tenant_id = this.tenantId;
    }
    if (this.branchId !== undefined) {
      context.branch_id = this.branchId;
    }
    return context;
  }
}

/** The AsyncLocalStorage that holds the RequestContext. */
export const requestStorage = new AsyncLocalStorage<RequestContext>();

/** Context of the current request, or undefined outside a request. */
export function readRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

/** Context of the current request; throws outside a request (appPlugin() missing). */
export function requireRequestContext(): RequestContext {
  const context = requestStorage.getStore();
  if (context === undefined) {
    throw new Error("REQUEST_CONTEXT_REQUIRED: use appPlugin() first, or runWithTenant() outside a request");
  }
  return context;
}

/** Request id ("-" outside a request). */
export function readRequestId(): string {
  const context = requestStorage.getStore();
  return context?.requestId ?? "-";
}

/** Tenant id of the request (x-tenant-id), if any. */
export function readTenantId(): string | undefined {
  const context = requestStorage.getStore();
  return context?.tenantId;
}

/** Branch id of the request (x-branch-id), if any. */
export function readBranchId(): string | undefined {
  const context = requestStorage.getStore();
  return context?.branchId;
}

/** Bearer token of the request, if any. */
export function readToken(): string | undefined {
  const context = requestStorage.getStore();
  return context?.token;
}

/** Session user of the request ({ id: "unknown" } without a token). */
export function readSessionUser(): SessionInfo {
  const context = requestStorage.getStore();
  return context?.sessionUser ?? buildUnknownSessionUser();
}

/** Logger of the request (request_id, tenant_id ...), or the app logger outside a request. */
export function readLogger(): AppLogger {
  const context = requestStorage.getStore();
  return context?.logger ?? appLogger;
}

/** Database of the request (set by tenantPlugin() / runWithTenant()); throws when there is none. */
export function readSessionDb(): AppDatabase {
  const context = requestStorage.getStore();
  const sessionDb = context?.sessionDb;
  if (sessionDb === undefined) {
    throw new Error("SESSION_DB_REQUIRED: add tenantPlugin() to the module, or use runWithTenant()");
  }
  return sessionDb;
}

/** Runs task(...args) with a request context. */
export function runWithContext<TResult, TArgs extends unknown[]>(
  context: RequestContext,
  task: (...args: TArgs) => TResult,
  ...args: TArgs
): TResult {
  return requestStorage.run(context, task, ...args);
}
