// query-cond.test.ts — dff-util filters and search input become safe Drizzle SQL.
import { describe, expect, it } from "bun:test";
import { PgDialect, boolean, doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { buildOrderBy, buildSearchWhere, readPaging, toFiltersWhere, toWhereCond } from "../src/index.ts";

const sampleEntity = pgTable("samples", {
  id: text("id").primaryKey(),
  city: text("city"),
  zipcode: text("zipcode"),
  lat: doublePrecision("lat"),
  active: boolean("active"),
  updated_at: timestamp("updated_at"),
});

const dialect = new PgDialect();

function render(where: SQL | undefined): { sql: string; params: unknown[] } {
  if (where === undefined) {
    return { sql: "", params: [] };
  }
  return dialect.sqlToQuery(where);
}

function testOperators(): void {
  const where = toWhereCond(
    [
      { key: "city", opt: "contains", value: "par" },
      { key: "lat", opt: "between", value: [1, 2] },
      { key: "zipCode", opt: "in", value: ["75001"] },
      { key: "dropTable", opt: "=", value: "x" },
    ],
    sampleEntity,
  );
  const query = render(where);
  expect(query.sql).toContain('"samples"."city" ilike $1');
  expect(query.sql).toContain('"samples"."lat" >= $2');
  expect(query.sql).toContain('"samples"."zipcode" in ($4)');
  expect(query.sql.includes("dropTable")).toBe(false);
  expect(query.params).toEqual(["%par%", 1, 2, "75001"]);
}

function testNullAndEmpty(): void {
  expect(toWhereCond([], sampleEntity)).toBeUndefined();
  const query = render(toWhereCond([{ key: "city", opt: "=", value: null }], sampleEntity));
  expect(query.sql).toBe('"samples"."city" is null');
  expect(toFiltersWhere("  ", sampleEntity)).toBeUndefined();
}

function testSearchWhere(): void {
  const where = buildSearchWhere(sampleEntity, { searchTerm: "ber", active: true }, ["city", "zipcode", "unknown"]);
  const query = render(where);
  expect(query.sql).toContain('"samples"."city" ilike $1 or "samples"."zipcode" ilike $2');
  expect(query.sql).toContain('"samples"."active" = $3');
  expect(query.params).toEqual(["%ber%", "%ber%", true]);
}

function testOrderAndPaging(): void {
  expect(render(buildOrderBy(sampleEntity, "city", "DESC")).sql).toBe('"samples"."city" desc');
  expect(render(buildOrderBy(sampleEntity, "city asc")).sql).toBe('"samples"."city" asc');
  expect(render(buildOrderBy(sampleEntity, "password; drop table x")).sql).toBe('"samples"."updated_at" desc');
  expect(readPaging({})).toEqual({ limit: 10, skip: 0 });
  expect(readPaging({ limit: 9999, skip: 20 })).toEqual({ limit: 500, skip: 20 });
  expect(readPaging({ limit: -1, skip: Number.NaN })).toEqual({ limit: 10, skip: 0 });
}

describe("query helpers", () => {
  it("turns QueryCond items into SQL and skips unknown columns", testOperators);
  it("handles null and empty input", testNullAndEmpty);
  it("builds the search WHERE (term + active)", testSearchWhere);
  it("orders only by real columns and limits paging", testOrderAndPaging);
});
