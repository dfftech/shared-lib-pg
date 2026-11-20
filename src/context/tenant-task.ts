// tenant-task.ts
// Runs work outside an HTTP request (Kafka consumer, cron job, startup task) with the same context a request has,
// so services work unchanged: readTenantId(), database.session(), readLogger() (logs go to the tenant's topic).
//   await database.runWithTenant("acme", syncOrders, orderIds);
//   await database.runWithTenant(undefined, cleanUp);            // single tenant / base database

import type { SessionInfo } from "../app-types.ts";
import type { Database } from "../db/database.ts";
import { RequestContext, requestStorage } from "./request-context.ts";

export type TenantTaskOptions = {
  /** Session user of the task (default { id: "unknown" }). */
  sessionUser?: SessionInfo;
  /** Shown as path in the logs (default: the task function name). */
  name?: string;
};

/** Context of a task for one tenant, with its database. */
export async function createTenantContext(
  database: Database,
  tenantId: string | undefined,
  options: TenantTaskOptions = {},
): Promise<RequestContext> {
  const context = new RequestContext({
    requestId: crypto.randomUUID(),
    method: "TASK",
    path: options.name ?? "task",
    tenantId,
    sessionUser: options.sessionUser,
  });
  context.database = database;
  context.sessionDb = await database.forTenant(tenantId);
  return context;
}

/** Runs task(...args) for a tenant (its database and logger). */
export async function runWithTenant<TResult, TArgs extends unknown[]>(
  database: Database,
  tenantId: string | undefined,
  task: (...args: TArgs) => Promise<TResult>,
  ...args: TArgs
): Promise<TResult> {
  const taskName = task.name === "" ? "task" : task.name;
  const context = await createTenantContext(database, tenantId, { name: taskName });
  return requestStorage.run(context, task, ...args);
}
