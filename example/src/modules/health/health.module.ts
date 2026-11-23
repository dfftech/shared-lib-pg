// health.module.ts
// Health module: service -> controller from the Database. Two route sets: /health without a database and
// /health/:id with the tenant database (tenant from the path when there is no x-tenant-id header).

import { Elysia, type AnyElysia } from "elysia";
import type { Database, IModule } from "shared-lib-pg";
import { HealthController } from "./health.controller.ts";
import { HealthService } from "./health.service.ts";

export class HealthModule implements IModule {
  private readonly database: Database;

  private readonly controller: HealthController;

  constructor(database: Database) {
    this.database = database;
    const service = new HealthService(database);
    this.controller = new HealthController(service);
  }

  /** /health on its own instance, /health/:id on one with the tenant plugin. */
  register(app: AnyElysia): void {

    const routes = new Elysia({ name: "health-routes" });
    this.controller.register(routes);
    app.use(routes);

    const tenantRoutes = new Elysia({ name: "health-tenant-routes" });
    const tenantDb = this.database.tenantPlugin({ tenantParam: "id" });
    tenantRoutes.use(tenantDb);
    this.controller.registerTenantRoutes(tenantRoutes);
    app.use(tenantRoutes);
  }
}
