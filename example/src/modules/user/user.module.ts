// user.module.ts
// User module: builds repository -> service -> controller from the Database (and the audit trail service it
// writes to) and registers the controller's routes with the tenant database of the request.

import { Elysia, type AnyElysia } from "elysia";
import type { Database, IModule } from "shared-lib-pg";
import { AuditLogRepository } from "../audit-log/audit-log.repository.ts";
import { AuditLogService } from "../audit-log/audit-log.service.ts";
import { UserController } from "./user.controller.ts";
import { UserRepository } from "./user.repository.ts";
import { UserService } from "./user.service.ts";

export class UserModule implements IModule {
  private readonly database: Database;

  private readonly controller: UserController;

  constructor(database: Database) {
    this.database = database;
    const repository = new UserRepository(database);
    const auditLogRepository = new AuditLogRepository(database);
    const auditLogService = new AuditLogService(auditLogRepository);
    const service = new UserService(repository, auditLogService);
    this.controller = new UserController(service);
  }

  /** Routes of the module on their own Elysia instance (the tenant plugin stays inside the module). */
  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "user-routes" });
    const tenantDb = this.database.tenantPlugin();
    routes.use(tenantDb);
    this.controller.register(routes);
    app.use(routes);
  }
}
