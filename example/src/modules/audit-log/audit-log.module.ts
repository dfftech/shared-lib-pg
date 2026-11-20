// audit-log.module.ts
// Audit trail module: builds repository -> service -> controller from the Database and registers the routes
// with the tenant database of the request.

import { Elysia, type AnyElysia } from "elysia";
import type { Database, IModule } from "shared-lib-pg";
import { AuditLogController } from "./audit-log.controller.ts";
import { AuditLogRepository } from "./audit-log.repository.ts";
import { AuditLogService } from "./audit-log.service.ts";

export class AuditLogModule implements IModule {
  private readonly database: Database;

  private readonly controller: AuditLogController;

  constructor(database: Database) {
    this.database = database;
    const repository = new AuditLogRepository(database);
    const service = new AuditLogService(repository);
    this.controller = new AuditLogController(service);
  }

  /** Routes of the module on their own Elysia instance (the tenant plugin stays inside the module). */
  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "audit-log-routes" });
    const tenantDb = this.database.tenantPlugin();
    routes.use(tenantDb);
    this.controller.register(routes);
    app.use(routes);
  }
}
