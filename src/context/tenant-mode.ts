// tenant-mode.ts
// Architecture flag shared between the Database and the request plugins. Database.init() sets it once it knows
// whether the base database has a tenants table; appPlugin() uses it to ignore x-tenant-id in single-tenant mode,
// so tenant_id never appears in the logs of a service that has no tenants.

// Defaults to true so tests / services without a Database still see tenant_id in logs and Kafka routing;
// Database.init() switches it off once it detects a single-tenant base database.
let isTenantMode = true;

/** Set by Database.init() after single / multi-tenant detection. */
export function setTenantMode(isEnabled: boolean): void {
  isTenantMode = isEnabled;
}

/** True when the service runs multi-tenant (the tenants table exists). */
export function readTenantMode(): boolean {
  return isTenantMode;
}
