// db-types.ts
// Drizzle database types used by the library and by services.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";

/** Drizzle on a pg Pool: the base database or one tenant database. */
export type AppDatabase = NodePgDatabase<Record<string, never>> & { $client: Pool };

/** Drizzle on one pooled connection that is inside BEGIN. */
export type AppTransactionDb = NodePgDatabase<Record<string, never>> & { $client: PoolClient };

/** Where a query runs: the request database or an open transaction. */
export type DbExecutor = AppDatabase | AppTransactionDb;
