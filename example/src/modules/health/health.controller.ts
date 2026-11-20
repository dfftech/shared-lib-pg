// health.controller.ts
// Health routes, registered by HealthModule:
//   GET /health       the service is up (no database needed)               register(app)
//   GET /health/:id   :id is the tenant (or x-tenant-id): pings its database  registerTenantRoutes(app)

import type { Elysia } from "elysia";
import type { ResponseType } from "shared-lib-pg";
import type { HealthService } from "./health.service.ts";

export class HealthController {
  private readonly service: HealthService;

  constructor(service: HealthService) {
    this.service = service;
  }

  /** GET /health */
  HealthCheck(): ResponseType {
    const data = this.service.CheckService();
    return { status: 200, data };
  }

  /** GET /health/:id */
  async TenantHealthCheck(): Promise<ResponseType> {
    const data = await this.service.CheckTenantService();
    return { status: 200, data };
  }

  /** Routes without a database. */
  register(app: Elysia): void {
    const healthCheck = this.HealthCheck.bind(this);
    app.get("/health", healthCheck);
  }

  /** Routes with the tenant database (the module adds the tenant plugin first). */
  registerTenantRoutes(app: Elysia): void {
    const tenantHealthCheck = this.TenantHealthCheck.bind(this);
    app.get("/health/:id", tenantHealthCheck);
  }
}
