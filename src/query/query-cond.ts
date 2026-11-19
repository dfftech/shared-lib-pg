// query-cond.ts
// dff-util QueryCond filters as a Drizzle WHERE (the Encore app-cond for this library):
//   const conds = QueryCond(input.filters);           // '{"city":"Paris","lat":{">":10}}' ...
//   const where = toWhereCond(conds, addressEntity);
// Keys are found as written or in snake_case (zipCode -> zipcode / zip_code). Unknown keys are skipped,
// so a filter can never name a column that is not in the table.

import { QueryCond, toSnakeCase, type QueryCondItem } from "dff-util";
import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from "drizzle-orm";

export type { QueryCondItem };

/** Column of a table by key: as written, then snake_case, then without "_". */
export function findTableColumn(table: Table, key: string): AnyColumn | undefined {
  const columns = getTableColumns(table) as Record<string, AnyColumn>;
  const directColumn = columns[key];
  if (directColumn !== undefined) {
    return directColumn;
  }
  const snakeKey = toSnakeCase(key);
  const snakeColumn = columns[snakeKey];
  if (snakeColumn !== undefined) {
    return snakeColumn;
  }
  const compactKey = snakeKey.replaceAll("_", "");
  return columns[compactKey];
}

function toBetweenCond(column: AnyColumn, value: unknown): SQL | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const fromCond = gte(column, value[0]);
  const toCond = lte(column, value[1]);
  return and(fromCond, toCond);
}

function toTextCond(column: AnyColumn, operator: string, value: unknown): SQL | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  switch (operator) {
    case "like":
      return like(column, value);
    case "ilike":
      return ilike(column, value);
    case "contains":
      return ilike(column, `%${value}%`);
    case "startswith":
      return like(column, `${value}%`);
    case "endswith":
      return like(column, `%${value}`);
    case "regex":
      return sql`${column} ~ ${value}`;
    default:
      return undefined;
  }
}

/** One condition as SQL; undefined when the operator or value does not fit. */
export function toOneCond(column: AnyColumn, item: QueryCondItem): SQL | undefined {
  const rawOperator = item.opt ?? "=";
  const trimmedOperator = rawOperator.trim();
  const operator = trimmedOperator.toLowerCase();
  const value = item.value;
  switch (operator) {
    case "=":
      return value === null ? isNull(column) : eq(column, value);
    case "!=":
    case "<>":
      return value === null ? isNotNull(column) : ne(column, value);
    case ">":
      return gt(column, value);
    case ">=":
      return gte(column, value);
    case "<":
      return lt(column, value);
    case "<=":
      return lte(column, value);
    case "in":
      return Array.isArray(value) && value.length > 0 ? inArray(column, value) : undefined;
    case "not in":
    case "notin":
      return Array.isArray(value) && value.length > 0 ? notInArray(column, value) : undefined;
    case "is null":
    case "isnull":
      return isNull(column);
    case "is not null":
    case "isnotnull":
      return isNotNull(column);
    case "exists":
      return value === true ? isNotNull(column) : isNull(column);
    case "between":
      return toBetweenCond(column, value);
    default:
      return toTextCond(column, operator, value);
  }
}

/** AND of every condition whose key is a column of the table; undefined when none. */
export function toWhereCond(conds: QueryCondItem[] | undefined, table: Table): SQL | undefined {
  if (conds === undefined || conds.length === 0) {
    return undefined;
  }
  const parts: SQL[] = [];
  for (const item of conds) {
    const column = findTableColumn(table, item.key);
    if (column === undefined) {
      continue;
    }
    const cond = toOneCond(column, item);
    if (cond !== undefined) {
      parts.push(cond);
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1 ? parts[0] : and(...parts);
}

/** WHERE from a filters text (dff-util QueryCond format); undefined for an empty or bad text. */
export function toFiltersWhere(filters: string | undefined, table: Table): SQL | undefined {
  if (filters === undefined || filters.trim() === "") {
    return undefined;
  }
  try {
    const conds = QueryCond(filters);
    return toWhereCond(conds, table);
  } catch {
    return undefined;
  }
}
