// user.entity.ts
// Drizzle table of the users of a tenant. Only for queries and types: the table is created by the sql/ migrations.

import { boolean, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const userEntity = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  mobile: varchar("mobile", { length: 32 }),
  persona: varchar("persona", { length: 20 }).notNull().default("user"),
  active: boolean("active").notNull().default(true),
  created_by: varchar("created_by", { length: 255 }).notNull().default("System"),
  updated_by: varchar("updated_by", { length: 255 }).notNull().default("System"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserEntity = typeof userEntity.$inferSelect;
