// db-transaction.ts
// Transactions on the database of the request (the tenant database when multi-tenant).
//   const transaction = await TransactionManager.begin();
//   try { await saveParts(transaction.db); await transaction.commit(); }
//   catch (error) { await transaction.rollback(); throw error; }
// or, with a top-level task function:
//   const saved = await runInTransaction(saveOrderTask, orderDto);

import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { readSessionDb } from "../context/request-context.ts";
import { appLogger } from "../logging/app-logger.ts";
import { readErrorText } from "../utils/text-util.ts";
import type { AppTransactionDb } from "./db-types.ts";

export interface ITransaction {
  db: AppTransactionDb;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type TransactionTask<TResult, TArgs extends unknown[]> = (db: AppTransactionDb, ...args: TArgs) => Promise<TResult>;

/**
 * Owns one pool connection from BEGIN until COMMIT / ROLLBACK, then releases it.
 * Finishing twice is a no-op, so rollback() in a catch after a failed commit() is safe.
 */
export class DrizzleTransaction implements ITransaction {
  readonly db: AppTransactionDb;

  private readonly client: PoolClient;

  private isFinished = false;

  constructor(db: AppTransactionDb, client: PoolClient) {
    this.db = db;
    this.client = client;
  }

  async commit(): Promise<void> {
    if (this.isFinished) {
      return;
    }
    this.isFinished = true;
    try {
      await this.client.query("COMMIT");
      this.client.release();
    } catch (error) {
      this.client.release(error as Error);
      throw error;
    }
  }

  /** Never throws, so it cannot hide the error that caused the rollback. */
  async rollback(): Promise<void> {
    if (this.isFinished) {
      return;
    }
    this.isFinished = true;
    try {
      await this.client.query("ROLLBACK");
      this.client.release();
    } catch (error) {
      const errorText = readErrorText(error);
      appLogger.error("db: rollback failed", { error: errorText });
      this.client.release(error as Error);
    }
  }
}

export class TransactionManager {
  /** Starts a transaction on the request database (readSessionDb()). */
  static async begin(): Promise<ITransaction> {
    const sessionDb = readSessionDb();
    const client = await sessionDb.$client.connect();
    try {
      await client.query("BEGIN");
    } catch (error) {
      client.release(error as Error);
      throw error;
    }
    const db = drizzle({ client });
    return new DrizzleTransaction(db, client);
  }
}

/** Runs task(db, ...args) in a transaction: COMMIT when it resolves, ROLLBACK (and rethrow) when it throws. */
export async function runInTransaction<TResult, TArgs extends unknown[]>(
  task: TransactionTask<TResult, TArgs>,
  ...args: TArgs
): Promise<TResult> {
  const transaction = await TransactionManager.begin();
  try {
    const result = await task(transaction.db, ...args);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
