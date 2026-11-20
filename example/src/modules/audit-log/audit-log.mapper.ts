// audit-log.mapper.ts
// Conversions of the audit trail. Pure: the service passes the request values (request id, branch, user).
//   change + request values -> row values           ToEntry
//   entity                  -> reply view            ToView, ToViewList, ToViewPage

import { randomUUID } from "node:crypto";
import type { SearchPage } from "shared-lib-pg";
import type { AuditAction, AuditLogView } from "./audit-log.dto.ts";
import type { AuditLogEntity, AuditLogValues } from "./audit-log.entity.ts";

/** What an audit entry records: the change and who / which request made it. */
export type AuditEntryInput = {
  entity: string;
  entityId: string;
  action: AuditAction;
  data: unknown;
  requestId: string;
  branchId: string | undefined;
  userId: string;
};

export class AuditLogMapper {
  /** Row values of a new audit entry. */
  static ToEntry(input: AuditEntryInput): AuditLogValues {
    return {
      id: randomUUID(),
      entity: input.entity,
      entity_id: input.entityId,
      action: input.action,
      data: input.data,
      request_id: input.requestId,
      branch_id: input.branchId ?? null,
      created_by: input.userId,
    };
  }

  /** Reply view of a stored audit entry. */
  static ToView(entity: AuditLogEntity): AuditLogView {
    return {
      id: entity.id,
      entity: entity.entity,
      entityId: entity.entity_id,
      action: entity.action,
      data: entity.data,
      requestId: entity.request_id,
      branchId: entity.branch_id,
      createdBy: entity.created_by,
      createdAt: entity.created_at.toISOString(),
    };
  }

  /** Reply views of a list of audit entries. */
  static ToViewList(entities: AuditLogEntity[]): AuditLogView[] {
    const views: AuditLogView[] = [];
    for (const entity of entities) {
      const view = this.ToView(entity);
      views.push(view);
    }
    return views;
  }

  /** Search page with reply views. */
  static ToViewPage(page: SearchPage<AuditLogEntity>): SearchPage<AuditLogView> {
    const data = this.ToViewList(page.data);
    return { ...page, data };
  }
}
