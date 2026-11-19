// audit-log.entity.ts
// Drizzle table of the audit trail of a tenant: one row per change of another module (who, which request, what).
// Only for queries and types: the table is created by the sql/ migrations. Rows are never updated.

import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const auditLogEntity = pgTable("audit_logs", {
  id: varchar("id", { length: 255 }).primaryKey(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entity_id: varchar("entity_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  data: jsonb("data"),
  request_id: varchar("request_id", { length: 128 }),
  branch_id: varchar("branch_id", { length: 128 }),
  created_by: varchar("created_by", { length: 255 }).notNull().default("System"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntity = typeof auditLogEntity.$inferSelect;

export type AuditLogValues = typeof auditLogEntity.$inferInsert;
