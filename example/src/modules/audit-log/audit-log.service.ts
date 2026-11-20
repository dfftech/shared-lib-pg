// audit-log.service.ts
// Audit trail of the tenant. Other modules get an AuditLogService in their module constructor and call
// RecordService with THEIR transaction, so a change and its audit entry are saved together or not at all.
// Who, request id and branch come from the request context; AuditLogMapper builds the row and the views.

import { branch_id, request_id, session_user, type ITransaction, type SearchPage } from "shared-lib-pg";
import type { AuditAction, AuditLogSearchDto, AuditLogView } from "./audit-log.dto.ts";
import { AuditLogMapper } from "./audit-log.mapper.ts";
import type { AuditLogRepository } from "./audit-log.repository.ts";

export class AuditLogService {
  private readonly repository: AuditLogRepository;

  constructor(repository: AuditLogRepository) {
    this.repository = repository;
  }

  /** Writes the audit entry of a change; pass the transaction of the change. */
  async RecordService(
    entity: string,
    entityId: string,
    action: AuditAction,
    data: unknown,
    transaction?: ITransaction,
  ): Promise<AuditLogView> {
    const sessionUser = session_user();
    const entry = AuditLogMapper.ToEntry({
      entity,
      entityId,
      action,
      data,
      requestId: request_id(),
      branchId: branch_id(),
      userId: sessionUser.id,
    });
    const row = await this.repository.Create(entry, transaction);
    return AuditLogMapper.ToView(row);
  }

  /** One audit entry by id, or null. */
  async EntityByIdService(id: string): Promise<AuditLogView | null> {
    const row = await this.repository.FindById(id);
    return row === undefined ? null : AuditLogMapper.ToView(row);
  }

  /** One page of audit entries, newest first. */
  async SearchService(input: AuditLogSearchDto): Promise<SearchPage<AuditLogView>> {
    const page = await this.repository.Search(input);
    return AuditLogMapper.ToViewPage(page);
  }
}
