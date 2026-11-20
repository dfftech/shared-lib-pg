// tenant-plugin.ts
// Gives the routes of a module their database (the Encore TenantMiddleware for Elysia). Made by the Database:
//   const routes = new Elysia({ name: "user-routes" }).use(this.database.tenantPlugin());
//   multi-tenant  (the tenants table exists): tenant from x-tenant-id (or a path param), sessionDb = its database;
//                 no tenant -> 400 TENANT_REQUIRED, unknown tenant -> 404 TENANT_NOT_FOUND; "core" = base database
//   single tenant: sessionDb = the base database
// Repositories then use database.executor(transaction) / database.session().

import { Elysia } from "elysia";
import { requireRequestContext } from "../context/request-context.ts";
import type { Database } from "../db/database.ts";
import type { AppDatabase } from "../db/db-types.ts";
import { readText } from "../utils/text-util.ts";

export type TenantPluginOptions = {
  /** Path param with the tenant when the x-tenant-id header is missing, e.g. "id" for /health/:id. */
  tenantParam?: string;
};

export type TenantProps = {
  tenantId: string | undefined;
  sessionDb: AppDatabase;
};

type ParamsHolder = {
  params?: Record<string, string | undefined>;
};

function readTenantParam(options: TenantPluginOptions, routeContext: ParamsHolder): string | undefined {
  const paramName = options.tenantParam;
  if (paramName === undefined) {
    return undefined;
  }
  const params = routeContext.params ?? {};
  const value = readText(params[paramName]);
  return value === "" ? undefined : value;
}

async function resolveTenantDb(database: Database, options: TenantPluginOptions, routeContext: ParamsHolder): Promise<TenantProps> {
  const context = requireRequestContext();
  context.database = database;
  const tenantId = context.tenantId ?? readTenantParam(options, routeContext);
  context.tenantId = tenantId;
  const sessionDb = await database.forTenant(tenantId);
  context.sessionDb = sessionDb;
  return { tenantId, sessionDb };
}

/** Tenant database for the routes of the Elysia instance that uses it (see the file header). */
export function createTenantPlugin(database: Database, options: TenantPluginOptions = {}) {
  const resolver = resolveTenantDb.bind(null, database, options);
  return new Elysia().derive("plugin", resolver);
}
