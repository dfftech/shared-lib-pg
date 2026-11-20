import { QueryCond as DffQueryCond, toSnakeCase, type QueryCondItem as DffQueryCondItem } from "dff-util";
import {
  and,
  type AnyColumn,
  eq,
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
  type SQL,
} from "drizzle-orm";

/** Parses the dff-util filter text into condition items. */
export function QueryCond(input: string): DffQueryCondItem[] {
  return DffQueryCond(input);
}

export type QueryCondItem = DffQueryCondItem;

type ColumnReader = (key: string) => AnyColumn | undefined;

function readTableColumn(table: Record<string, AnyColumn>, key: string): AnyColumn | undefined {
  const columnKey = toSnakeCase(key);
  return table[columnKey];
}

/** Creates a reader for a table's columns, mapping requested keys to snake_case. */
export function getColumnForTable(table: Record<string, AnyColumn>): ColumnReader {
  return readTableColumn.bind(null, table);
}

function toBetweenCond(column: AnyColumn, value: unknown): SQL | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const lowerCondition = gte(column, value[0]);
  const upperCondition = lte(column, value[1]);
  return and(lowerCondition, upperCondition);
}

function oneCond(item: QueryCondItem, getColumn: ColumnReader): SQL | undefined {
  const col = getColumn(item.key);
  if (col === undefined) {
    return undefined;
  }
  const rawOption = item.opt || "=";
  const trimmedOption = rawOption.trim();
  const opt = trimmedOption.toLowerCase();
  const val = item.value;

  switch (opt) {
    case "=":
      return val === null ? isNull(col) : eq(col, val);
    case "!=":
    case "<>":
      return val === null ? isNotNull(col) : ne(col, val);
    case ">":
      return gt(col, val);
    case ">=":
      return gte(col, val);
    case "<":
      return lt(col, val);
    case "<=":
      return lte(col, val);
    case "in":
      return Array.isArray(val) ? inArray(col, val) : undefined;
    case "not in":
    case "notin":
      return Array.isArray(val) ? notInArray(col, val) : undefined;
    case "is null":
    case "isnull":
      return isNull(col);
    case "is not null":
    case "isnotnull":
      return isNotNull(col);
    case "between":
      return toBetweenCond(col, val);
    case "like":
      return typeof val === "string" ? like(col, val) : undefined;
    case "ilike":
      return typeof val === "string" ? ilike(col, val) : undefined;
    case "contains":
      return typeof val === "string" ? ilike(col, `%${val}%`) : undefined;
    case "startswith":
      return typeof val === "string" ? like(col, `${val}%`) : undefined;
    case "endswith":
      return typeof val === "string" ? like(col, `%${val}`) : undefined;
    case "regex":
      return typeof val === "string" ? sql`${col} ~ ${val}` : undefined;
    case "exists":
      return val === true ? isNotNull(col) : isNull(col);
    default:
      return undefined;
  }
}

/** Combines supported filter conditions with AND; undefined when no conditions match. */
export function toWhereCond(
  conds: QueryCondItem[] | undefined,
  getColumn: ColumnReader,
): SQL | undefined {
  if (conds === undefined || conds.length === 0) {
    return undefined;
  }
  const list: SQL[] = [];
  for (const item of conds) {
    const condition = oneCond(item, getColumn);
    if (condition !== undefined) {
      list.push(condition);
    }
  }
  if (list.length === 0) {
    return undefined;
  }
  if (list.length === 1) {
    return list[0];
  }
  return and(...list);
}
