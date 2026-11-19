// audit-columns.test.ts — a new row gets created_* and updated_*; an existing row keeps its created_*.
import { describe, expect, it } from "bun:test";
import { buildAuditColumns } from "../src/index.ts";

const NOW = new Date("2026-11-19T10:00:00.000Z");

const CREATED = new Date("2026-01-01T00:00:00.000Z");

function testNewRow(): void {
  const columns = buildAuditColumns(undefined, "user-1", NOW);
  expect(columns).toEqual({ created_at: NOW, created_by: "user-1", updated_at: NOW, updated_by: "user-1" });
}

function testExistingRow(): void {
  const existing = { created_at: CREATED, created_by: "creator", updated_at: CREATED, updated_by: "creator" };
  const columns = buildAuditColumns(existing, "editor", NOW);
  expect(columns).toEqual({ created_at: CREATED, created_by: "creator", updated_at: NOW, updated_by: "editor" });
}

describe("buildAuditColumns", () => {
  it("fills every audit column for a new row", testNewRow);
  it("keeps created_* of an existing row", testExistingRow);
});
