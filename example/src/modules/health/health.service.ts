// health.service.ts
// Health checks: the service itself (no database) and one tenant database (a ping on the request database).

import { sql } from "drizzle-orm";
import { logger, readAppConfig, session_db, tenant_id, type Database } from "shared-bun-elysia";

export type ServiceHealth = {
  message: string;
  service: string;
  version: string;
  hasDatabase: boolean;
  isMultiTenant: boolean;
  tenantCount: number;
  modules: string[];
};

export type TenantHealth = {
  message: string;
  tenant: string | undefined;
  version: string;
  dbPingMs: number;
};

const HEALTH_PASS = "Health Check Pass";

export class HealthService {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  /** Health of the service: version, database mode, open tenant pools and modules of the config. */
  CheckService(): ServiceHealth {
    const config = readAppConfig();
    const tenantIds = this.database.tenantIds();
    const moduleNames: string[] = [];
    for (const definition of config.modules) {
      moduleNames.push(definition.name);
    }
    return {
      message: HEALTH_PASS,
      service: config.serviceName,
      version: config.version,
      hasDatabase: this.database.isConfigured,
      isMultiTenant: this.database.isMultiTenant,
      tenantCount: tenantIds.length,
      modules: moduleNames,
    };
  }

  /** Pings the database of the request tenant. */
  async CheckTenantService(): Promise<TenantHealth> {
    const config = readAppConfig();
    const db = session_db();
    const startTime = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbPingMs = Date.now() - startTime;
    const tenant = tenant_id();
    const requestLogger = logger();
    requestLogger.info("Tenant health check", { tenant, db_ping_ms: dbPingMs });
    return { message: HEALTH_PASS, tenant, version: config.version, dbPingMs };
  }
}
