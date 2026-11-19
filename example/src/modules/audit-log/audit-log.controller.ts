// audit-log.controller.ts
// HTTP routes of the audit trail, registered by AuditLogModule. Read only: entries are written by other services
// inside their own transaction, so there is no save route.
//   POST /audit-log-search        SearchAuditLogs
//   GET  /audit-log-entity/:id    EntityByIdAuditLog

import type { ResponseType } from "dff-util";
import type { Elysia } from "elysia";
import { LISTED_SUCCESSFULLY } from "shared-bun-elysia";
import { AuditLogDto, type AuditLogIdParams, type AuditLogSearchDto } from "./audit-log.dto.ts";
import type { AuditLogService } from "./audit-log.service.ts";

export class AuditLogController {
  private readonly service: AuditLogService;

  constructor(service: AuditLogService) {
    this.service = service;
  }

  /** POST /audit-log-search — page of audit entries, newest first. */
  async SearchAuditLogs(context: { body: AuditLogSearchDto }): Promise<ResponseType> {
    const page = await this.service.SearchService(context.body);
    return { ...page, status: LISTED_SUCCESSFULLY };
  }

  /** GET /audit-log-entity/:id — one audit entry. */
  async EntityByIdAuditLog(context: { params: AuditLogIdParams }): Promise<ResponseType> {
    const data = await this.service.EntityByIdService(context.params.id);
    return { data };
  }

  /** Adds the routes of this controller to the module's Elysia instance. */
  register(app: Elysia): void {
    const searchAuditLogs = this.SearchAuditLogs.bind(this);
    const entityByIdAuditLog = this.EntityByIdAuditLog.bind(this);
    app.post("/audit-log-search", { body: AuditLogDto.SearchSchema }, searchAuditLogs);
    app.get("/audit-log-entity/:id", { params: AuditLogDto.IdParamsSchema }, entityByIdAuditLog);
  }
}
