// search-page.ts
// Paged search: rows + total count in one call.
//   searchRows  -> entity rows, for a repository whose module has a mapper (the mapper makes the views)
//   searchPage  -> rows as dff-util view objects (camelCase), for modules without a mapper
//   const where = buildSearchWhere(addressEntity, input, ["address", "city"], [typeCond]);
//   return searchPage(db, addressEntity, input, where);      // db = readDbExecutor(transaction) in a repository
//   -> { data, total, skip, limit }
// limit defaults to 10 and is at most 500. orderBy must be a column of the table (else updated_at / created_at / id).

import { toViewMapper } from "dff-util";
import { and, asc, count, desc, eq, ilike, or, type InferSelectModel, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SearchType } from "../app-types.ts";
import type { AppDatabase, AppTransactionDb } from "../db/db-types.ts";
import { findTableColumn, toFiltersWhere } from "./query-cond.ts";

export type SearchPage<TRow = Record<string, unknown>> = {
  data: TRow[];
  total: number;
  skip: number;
  limit: number;
};

export type Paging = {
  limit: number;
  skip: number;
};

export const DEFAULT_SEARCH_LIMIT = 10;

export const MAX_SEARCH_LIMIT = 500;

const DEFAULT_ORDER_KEYS = ["updated_at", "created_at", "id"];

function readWholeNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }
  return Math.floor(numberValue);
}

/** limit (default 10, max 500) and skip (default 0) of a search. */
export function readPaging(input: SearchType): Paging {
  const requestedLimit = readWholeNumber(input.limit, DEFAULT_SEARCH_LIMIT);
  const limit = Math.min(requestedLimit, MAX_SEARCH_LIMIT);
  const skip = readWholeNumber(input.skip, 0);
  return { limit, skip };
}

/**
 * ORDER BY of a search: input.orderBy when it is a column ("city" or "city desc"), else updated_at DESC,
 * else created_at DESC, else id DESC. input.order ("ASC" / "DESC") is used when orderBy has no direction.
 */
export function buildOrderBy(table: PgTable, orderBy?: string, order?: string): SQL | undefined {
  const orderText = orderBy?.trim() ?? "";
  const orderParts = orderText.split(/\s+/);
  const requestedKey = orderParts[0] ?? "";
  const directionText = orderParts[1] ?? order ?? "";
  const upperDirection = directionText.toUpperCase();
  if (requestedKey !== "") {
    const requestedColumn = findTableColumn(table, requestedKey);
    if (requestedColumn !== undefined) {
      return upperDirection === "DESC" ? desc(requestedColumn) : asc(requestedColumn);
    }
  }
  for (const key of DEFAULT_ORDER_KEYS) {
    const column = findTableColumn(table, key);
    if (column !== undefined) {
      return desc(column);
    }
  }
  return undefined;
}

/** OR of "column ILIKE %term%" over the given keys; undefined for an empty term. */
export function buildSearchTermWhere(table: PgTable, searchTerm: string | undefined, keys: string[]): SQL | undefined {
  const term = searchTerm?.trim() ?? "";
  if (term === "") {
    return undefined;
  }
  const pattern = `%${term}%`;
  const parts: SQL[] = [];
  for (const key of keys) {
    const column = findTableColumn(table, key);
    if (column !== undefined) {
      const match = ilike(column, pattern);
      parts.push(match);
    }
  }
  return parts.length === 0 ? undefined : or(...parts);
}

/**
 * WHERE of a search: searchTerm over the term keys, "active" (when the table has it), dff-util filters
 * and the extra conditions of the module, joined with AND.
 */
export function buildSearchWhere(
  table: PgTable,
  input: SearchType,
  termKeys: string[],
  extraConds: Array<SQL | undefined> = [],
): SQL | undefined {
  const parts: SQL[] = [];
  const termCond = buildSearchTermWhere(table, input.searchTerm, termKeys);
  if (termCond !== undefined) {
    parts.push(termCond);
  }
  const activeColumn = findTableColumn(table, "active");
  if (input.active !== undefined && activeColumn !== undefined) {
    const activeCond = eq(activeColumn, input.active);
    parts.push(activeCond);
  }
  const filtersCond = toFiltersWhere(input.filters, table);
  if (filtersCond !== undefined) {
    parts.push(filtersCond);
  }
  for (const extraCond of extraConds) {
    if (extraCond !== undefined) {
      parts.push(extraCond);
    }
  }
  return parts.length === 0 ? undefined : and(...parts);
}

/**
 * One page of entity rows (as stored, snake_case) and the total count, for a repository; the module mapper
 * turns them into views: AddressMapper.ToViewPage(page).
 */
export async function searchRows<TTable extends PgTable>(
  db: AppDatabase | AppTransactionDb,
  table: TTable,
  input: SearchType,
  where?: SQL,
): Promise<SearchPage<InferSelectModel<TTable>>> {
  const paging = readPaging(input);
  const orderSql = buildOrderBy(table, input.orderBy, input.order);
  const orderList = orderSql === undefined ? [] : [orderSql];
  const rowsQuery = db.select().from(table as PgTable).where(where).orderBy(...orderList).limit(paging.limit).offset(paging.skip);
  const countQuery = db.select({ value: count() }).from(table as PgTable).where(where);
  const [rows, totalRows] = await Promise.all([rowsQuery, countQuery]);
  const total = Number(totalRows[0]?.value ?? 0);
  return { data: rows as InferSelectModel<TTable>[], total, skip: paging.skip, limit: paging.limit };
}

/** One page of rows as dff-util view objects (camelCase keys) and the total count; for modules without a mapper. */
export async function searchPage(
  db: AppDatabase | AppTransactionDb,
  table: PgTable,
  input: SearchType,
  where?: SQL,
): Promise<SearchPage> {
  const page = await searchRows(db, table, input, where);
  const data = toViewMapper(page.data) as Record<string, unknown>[];
  return { ...page, data };
}
