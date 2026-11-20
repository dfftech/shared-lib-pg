// address.module.ts
// Address module: builds repository -> service -> controller from the Database (and the audit trail service it
// writes to) and registers the controller's routes with the tenant database of the request.

import { Elysia, type AnyElysia } from "elysia";
import type { Database, IModule } from "shared-lib-pg";
import { AuditLogRepository } from "../audit-log/audit-log.repository.ts";
import { AuditLogService } from "../audit-log/audit-log.service.ts";
import { AddressController } from "./address.controller.ts";
import { AddressRepository } from "./address.repository.ts";
import { AddressService } from "./address.service.ts";

export class AddressModule implements IModule {
  private readonly database: Database;

  private readonly controller: AddressController;

  constructor(database: Database) {
    this.database = database;
    const repository = new AddressRepository(database);
    const auditLogRepository = new AuditLogRepository(database);
    const auditLogService = new AuditLogService(auditLogRepository);
    const service = new AddressService(repository, auditLogService);
    this.controller = new AddressController(service);
  }

  /** Routes of the module on their own Elysia instance (the tenant plugin stays inside the module). */
  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "address-routes" });
    const tenantDb = this.database.tenantPlugin();
    routes.use(tenantDb);
    this.controller.register(routes);
    app.use(routes);
  }
}
