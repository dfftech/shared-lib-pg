// audit-columns.ts
// Audit columns of an entity for a save (snake_case, the table convention of the core stack):
//   new row      -> created_* and updated_* = now / user
//   existing row -> created_* kept from the row, updated_* = now / user
// Used by module mappers: const auditColumns = buildAuditColumns(existing, userId);  { ...values, ...auditColumns }

export type AuditColumns = {
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
};

/** Audit columns of a save; existing = the stored row (undefined for a new row). */
export function buildAuditColumns(existing: Partial<AuditColumns> | undefined, userId: string, now: Date = new Date()): AuditColumns {
  return {
    created_at: existing?.created_at ?? now,
    created_by: existing?.created_by ?? userId,
    updated_at: now,
    updated_by: userId,
  };
}
