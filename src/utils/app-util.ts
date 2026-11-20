import type { SessionInfo } from "../app-types.ts";
import { readAppConfig } from "../config/app-config.ts";
import {
  readBranchId,
  readLogger,
  readRequestContext,
  readRequestId,
  readSessionDb,
  readSessionUser,
  readTenantId,
  readToken,
  requireRequestContext,
  type RequestDatabaseProvider,
} from "../context/request-context.ts";
import type { AppDatabase } from "../db/db-types.ts";
import type { AppLogger } from "../logging/log-types.ts";

export { toEntityMapper, toViewMapper } from "dff-util";
export { readErrorText, readOptionalNumber, readOptionalText, readText } from "./text-util.ts";

export type SessionMeta = {
  logger: AppLogger;
  session_user: SessionInfo;
  request_id: string;
  token: string | undefined;
  tenant_id: string | undefined;
  branch_id: string | undefined;
};

/** Uppercase configured base name, or "-" when it is empty. */
export function env_base_name(): string {
  const configuredBaseName = readAppConfig().baseName;
  const baseName = configuredBaseName.trim() || "-";
  return baseName.toUpperCase();
}

/** Reads a BASE_NAME-prefixed environment variable, e.g. env("DB_URL") -> CORE_DB_URL. */
export function env(key: string): string | undefined {
  const baseName = env_base_name();
  const name = `${baseName}_${key}`.toUpperCase();
  const value = process.env[name];
  return value;
}


/** Request metadata, or the library defaults when called outside a request. */
export function session_meta(): SessionMeta {
  const metadata: SessionMeta = {
    logger: readLogger(),
    session_user: readSessionUser(),
    request_id: readRequestId(),
    token: readToken(),
    tenant_id: readTenantId(),
    branch_id: readBranchId(),
  };
  return metadata;
}

export function logger(): AppLogger {
  return readLogger();
}

export function session_user(): SessionInfo {
  return readSessionUser();
}

export function request_id(): string {
  return readRequestId();
}

export function token(): string | undefined {
  return readToken();
}

/** Query string values of the current request; duplicate keys use the last value. */
export function query_params(): Record<string, string> {
  const context = readRequestContext();
  const pathAndQuery = context?.pathAndQuery ?? "";
  const queryIndex = pathAndQuery.indexOf("?");
  if (queryIndex === -1) {
    return {};
  }
  const queryString = pathAndQuery.slice(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

export function tenant_id(): string | undefined {
  return readTenantId();
}

/** IDs of the active tenant pools configured in the current request's database. */
export function tenant_ids(): string[] {
  const database = requireDatabase();
  return database.tenantIds();
}

/** Optional x-branch-id header. */
export function branch_id(): string | undefined {
  return readBranchId();
}

function requireDatabase(): RequestDatabaseProvider {
  const context = requireRequestContext();
  const database = context.database;
  if (database === undefined) {
    throw new Error("REQUEST_DATABASE_REQUIRED: use tenantPlugin() first, or runWithTenant()");
  }
  return database;
}

export function core_db(): AppDatabase {
  const database = requireDatabase();
  return database.core();
}

export function session_db(): AppDatabase {
  return readSessionDb();
}

export async function get_db(key: string): Promise<AppDatabase> {
  const database = requireDatabase();
  return database.forTenant(key);
}
