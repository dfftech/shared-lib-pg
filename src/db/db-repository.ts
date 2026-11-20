// db-repository.ts
// Repositories: the only module classes that run Drizzle queries. A module repository extends DrizzleRepository
// and gets the Database through its constructor (the image: new UserRepository(database)):
//   export class UserRepository extends DrizzleRepository<typeof userEntity> {
//     constructor(database: Database) { super(database, userEntity); }
//   }
// Every method takes an optional transaction as its LAST argument:
//   with it    -> the query is part of that transaction (database.begin())
//   without it -> the query runs on the database of the request (database.session())
// The row helpers (and the base class) need a column named "id" in the table.

import type { SearchType } from "../app-types.ts";
import { eq, type InferInsertModel, type InferSelectModel, type SQL } from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { readSessionDb } from "../context/request-context.ts";
import { findTableColumn } from "../query/query-cond.ts";
import { searchRows, type SearchPage } from "../query/search-page.ts";
import type { Database } from "./database.ts";
import type { ITransaction } from "./db-transaction.ts";
import type { DbExecutor } from "./db-types.ts";

export type { DbExecutor };

export type RowId = string | number;

/** The transaction's db when one is given, else the database of the request. */
export function readDbExecutor(transaction?: ITransaction): DbExecutor {
  if (transaction === undefined) {
    return readSessionDb();
  }
  return transaction.db;
}

function readIdColumn(table: PgTable): PgColumn {
  const idColumn = findTableColumn(table, "id");
  if (idColumn === undefined) {
    throw new Error("REPOSITORY_ID_COLUMN_REQUIRED: the table has no \"id\" column");
  }
  return idColumn as PgColumn;
}

/** One row by id, or undefined. */
export async function findRowById<TTable extends PgTable>(
  db: DbExecutor,
  table: TTable,
  id: RowId,
): Promise<InferSelectModel<TTable> | undefined> {
  const idColumn = readIdColumn(table);
  const idMatch = eq(idColumn, id);
  const rows = await db.select().from(table as PgTable).where(idMatch).limit(1);
  return rows[0] as InferSelectModel<TTable> | undefined;
}

/** Inserts one row and returns it as stored (defaults filled in). */
export async function insertRow<TTable extends PgTable>(
  db: DbExecutor,
  table: TTable,
  values: InferInsertModel<TTable>,
): Promise<InferSelectModel<TTable>> {
  const insertValues = values as PgInsertValue<TTable>;
  const rows = (await db.insert(table).values(insertValues).returning()) as unknown as InferSelectModel<TTable>[];
  const row = rows[0];
  if (row === undefined) {
    throw new Error("REPOSITORY_INSERT_FAILED: no row returned");
  }
  return row;
}

/** Updates the row with this id; returns it, or undefined when there is no such row. */
export async function updateRowById<TTable extends PgTable>(
  db: DbExecutor,
  table: TTable,
  id: RowId,
  values: Partial<InferInsertModel<TTable>>,
): Promise<InferSelectModel<TTable> | undefined> {
  const idColumn = readIdColumn(table);
  const idMatch = eq(idColumn, id);
  const setValues = values as PgUpdateSetSource<TTable>;
  const rows = (await db.update(table).set(setValues).where(idMatch).returning()) as unknown as InferSelectModel<TTable>[];
  return rows[0];
}

/** Deletes the row with this id; true when a row was deleted. */
export async function deleteRowById(db: DbExecutor, table: PgTable, id: RowId): Promise<boolean> {
  const idColumn = readIdColumn(table);
  const idMatch = eq(idColumn, id);
  const rows = await db.delete(table).where(idMatch).returning({ id: idColumn });
  return rows.length > 0;
}

/** Base class of a module repository: CRUD by id and paged search on one table, transaction last. */
export class DrizzleRepository<TTable extends PgTable> {
  protected readonly database: Database;

  protected readonly table: TTable;

  constructor(database: Database, table: TTable) {
    this.database = database;
    this.table = table;
  }

  /** Entity table of this repository. */
  Entity(): TTable {
    return this.table;
  }

  /** The transaction when given, else the database of the request. */
  Db(transaction?: ITransaction): DbExecutor {
    return this.database.executor(transaction);
  }

  /** Starts a transaction on the database of the request; pass it to every write, then commit / rollback. */
  Begin(): Promise<ITransaction> {
    return this.database.begin();
  }

  /** One row by id. */
  async FindById(id: RowId, transaction?: ITransaction): Promise<InferSelectModel<TTable> | undefined> {
    const db = this.Db(transaction);
    return findRowById(db, this.table, id);
  }

  /** Inserts one row and returns it as stored. */
  async Create(values: InferInsertModel<TTable>, transaction?: ITransaction): Promise<InferSelectModel<TTable>> {
    const db = this.Db(transaction);
    return insertRow(db, this.table, values);
  }

  /** Updates the row with this id; undefined when it does not exist. */
  async UpdateById(
    id: RowId,
    values: Partial<InferInsertModel<TTable>>,
    transaction?: ITransaction,
  ): Promise<InferSelectModel<TTable> | undefined> {
    const db = this.Db(transaction);
    return updateRowById(db, this.table, id, values);
  }

  /** Deletes the row with this id; true when a row was deleted. */
  async DeleteById(id: RowId, transaction?: ITransaction): Promise<boolean> {
    const db = this.Db(transaction);
    return deleteRowById(db, this.table, id);
  }

  /** One page of rows (entities) and the total count. */
  async SearchRows(input: SearchType, where?: SQL, transaction?: ITransaction): Promise<SearchPage<InferSelectModel<TTable>>> {
    const db = this.Db(transaction);
    return searchRows(db, this.table, input, where);
  }
}
