// db-schema.ts
// Drizzle table of the tenant registry ({schema}.tenants in the base database). Only for queries:
// entities never change the database; the table is created by SQL migrations.
//   const tenantEntity = database.tenantEntity();
//   const rows = await database.core().select().from(tenantEntity);
// Drizzle does not allow pgSchema("public"), so the public schema uses pgTable.

import type { InferSelectModel } from "drizzle-orm";
import { boolean, pgSchema, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { DEFAULT_SCHEMA } from "./db-url.ts";

/** Fresh column builders of the tenants table. */
export function buildTenantColumns() {
  return {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    updatedBy: text("updated_by").notNull(),
    active: boolean("active").notNull().default(true),
    name: text("name").notNull(),
    db: text("db").notNull(),
  };
}

/** The tenants table in a schema. */
export function buildTenantEntity(schema: string) {
  const columns = buildTenantColumns();
  if (schema === DEFAULT_SCHEMA) {
    return pgTable("tenants", columns);
  }
  const appSchema = pgSchema(schema);
  return appSchema.table("tenants", columns);
}

export type TenantEntity = InferSelectModel<ReturnType<typeof buildTenantEntity>>;
