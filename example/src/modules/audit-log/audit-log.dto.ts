// audit-log.dto.ts
// Request schemas of the audit trail (static, Elysia validates them), their types, the actions and the reply view.

import { t } from "elysia";
import { idParamsSchema, searchFields, type Static } from "shared-lib-pg";

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export class AuditLogDto {
  static readonly SearchSchema = t.Object({
    ...searchFields,
    entity: t.Optional(t.String()),
    entityId: t.Optional(t.String()),
    action: t.Optional(t.String()),
  });

  static readonly IdParamsSchema = idParamsSchema;
}

export type AuditLogSearchDto = Static<typeof AuditLogDto.SearchSchema>;

export type AuditLogIdParams = Static<typeof AuditLogDto.IdParamsSchema>;

/** Reply view of an audit entry (AuditLogMapper.ToView). */
export type AuditLogView = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  data: unknown;
  requestId: string | null;
  branchId: string | null;
  createdBy: string;
  createdAt: string;
};
