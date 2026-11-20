// database.ts
// The database of a service (multi-tenant PostgreSQL + Drizzle), built from the config (db) by Application and
// given to every module through its constructor: new UserModule(database) -> new UserRepository(database).
//   database.core()                      base database (registry / single tenant)
//   await database.tenant("acme")        one tenant database ("core" = base)
//   database.session()                   database of the current request (set by database.tenantPlugin())
//   database.executor(transaction)       the transaction when given, else session()
//   await database.begin()               transaction on session()
//   database.tenantPlugin()              Elysia plugin of a module: x-tenant-id -> tenant database of the request
//   await database.runWithTenant("acme", task, ...args)   background work with a tenant context
// Multi-tenant is detected once in init(): the table {schema}.tenants exists in the base database.

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { DbConfig } from "../config/app-config.ts";
import { readSessionDb } from "../context/request-context.ts";
import { setTenantMode } from "../context/tenant-mode.ts";
import { runWithTenant, type TenantTaskOptions } from "../context/tenant-task.ts";
import { appLogger } from "../logging/app-logger.ts";
import { createTenantPlugin, type TenantPluginOptions } from "../plugins/tenant-plugin.ts";
import { AppError } from "../utils/app-error.ts";
import { buildTenantEntity } from "./db-schema.ts";
import { readConnectionTarget } from "./db-url.ts";
import { TransactionManager, type ITransaction } from "./db-transaction.ts";
import type { AppDatabase, DbExecutor } from "./db-types.ts";
import { PoolManager, isCoreTenant } from "./pool-manager.ts";
import { TenantChangeListener } from "./tenant-listener.ts";

/** Error codes (AppError) of the tenant lookup. */
export const TENANT_REQUIRED = "TENANT_REQUIRED";

export const TENANT_NOT_FOUND = "TENANT_NOT_FOUND";

export class Database {
  private readonly config: DbConfig;

  private readonly pools: PoolManager;

  private readonly listener: TenantChangeListener;

  private readonly drizzleByPool = new WeakMap<Pool, AppDatabase>();

  private isTenantMode = false;

  private initPromise: Promise<void> | null = null;

  constructor(config: DbConfig, applicationName = "app") {
    this.config = config;
    this.pools = new PoolManager(config);
    this.listener = new TenantChangeListener(this.pools, applicationName);
  }

  /** True when db.url is set. */
  get isConfigured(): boolean {
    return this.pools.isConfigured;
  }

  /** True when the base database has a tenants table (known after init()). */
  get isMultiTenant(): boolean {
    return this.isTenantMode;
  }

  /** Schema of the base database (search_path of db.url). */
  get schema(): string {
    return this.pools.schema;
  }

  /**
   * Connects, detects single / multi-tenant, opens the tenant pools and starts the tenants listener.
   * Runs once; after a failure the next call tries again.
   */
  init(): Promise<void> {
    if (this.initPromise === null) {
      this.initPromise = this.initOnce();
    }
    return this.initPromise;
  }

  private async initOnce(): Promise<void> {
    try {
      await this.runInit();
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async runInit(): Promise<void> {
    if (!this.isConfigured) {
      appLogger.warn("db: init skipped, db.url is not set");
      return;
    }
    await this.pingCore();
    this.isTenantMode = await this.detectMultiTenant();
    setTenantMode(this.isTenantMode);
    const architecture = this.isTenantMode ? "multi_tenant" : "single_tenant";
    appLogger.info("db: architecture detected", { architecture, schema: this.schema });
    if (!this.isTenantMode) {
      return;
    }
    await this.pools.syncTenantPools();
    if (this.config.isTenantEventsEnabled) {
      await this.listener.start();
    }
  }

  private async pingCore(): Promise<void> {
    const pool = this.pools.readCorePool();
    const startTime = Date.now();
    const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
    const isOk = result.rows[0]?.ok === 1;
    if (!isOk) {
      throw new Error("core DB ping failed: expected a row with ok = 1");
    }
    appLogger.info("db: core connected", {
      target: readConnectionTarget(this.config.url),
      schema: this.schema,
      duration_ms: Date.now() - startTime,
    });
  }

  private async detectMultiTenant(): Promise<boolean> {
    const pool = this.pools.readCorePool();
    const result = await pool.query({
      text: "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'tenants' LIMIT 1",
      values: [this.schema],
    });
    return (result.rowCount ?? 0) > 0;
  }

  /** Drizzle on a pool (one instance per pool). */
  toDrizzle(pool: Pool): AppDatabase {
    const cachedDb = this.drizzleByPool.get(pool);
    if (cachedDb !== undefined) {
      return cachedDb;
    }
    const db = drizzle({ client: pool });
    this.drizzleByPool.set(pool, db);
    return db;
  }

  /** pg Pool of the base database. */
  corePool(): Pool {
    return this.pools.readCorePool();
  }

  /** Drizzle on the base database. */
  core(): AppDatabase {
    const pool = this.pools.readCorePool();
    return this.toDrizzle(pool);
  }

  /** pg Pool of a tenant ("core" -> base). Throws AppError TENANT_NOT_FOUND (404) for an unknown tenant. */
  async tenantPool(tenantId: string): Promise<Pool> {
    const isCore = isCoreTenant(tenantId);
    if (isCore) {
      return this.pools.readCorePool();
    }
    const pool = await this.pools.findTenantPool(tenantId);
    if (pool === undefined) {
      throw new AppError(TENANT_NOT_FOUND, 404);
    }
    return pool;
  }

  /** Drizzle on a tenant database ("core" -> base). */
  async tenant(tenantId: string): Promise<AppDatabase> {
    const pool = await this.tenantPool(tenantId);
    return this.toDrizzle(pool);
  }

  /**
   * Drizzle for a request: the tenant database when multi-tenant (tenant required), else the base database.
   * Throws AppError TENANT_REQUIRED (400) / TENANT_NOT_FOUND (404).
   */
  async forTenant(tenantId?: string): Promise<AppDatabase> {
    await this.init();
    if (!this.isTenantMode) {
      return this.core();
    }
    if (tenantId === undefined || tenantId === "") {
      throw new AppError(TENANT_REQUIRED, 400);
    }
    return this.tenant(tenantId);
  }

  /** Database of the current request (tenantPlugin / runWithTenant); throws outside one. */
  session(): AppDatabase {
    return readSessionDb();
  }

  /** Where a repository query runs: the transaction when given, else the database of the request. */
  executor(transaction?: ITransaction): DbExecutor {
    if (transaction === undefined) {
      return readSessionDb();
    }
    return transaction.db;
  }

  /** Transaction on the database of the request. */
  begin(): Promise<ITransaction> {
    return TransactionManager.begin();
  }

  /** Runs task(...args) for a tenant: its database, logger and context, outside a request. */
  runWithTenant<TResult, TArgs extends unknown[]>(
    tenantId: string | undefined,
    task: (...args: TArgs) => Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return runWithTenant(this, tenantId, task, ...args);
  }

  /** Elysia plugin for the routes of a module: tenant database of the request (see tenant-plugin.ts). */
  tenantPlugin(options: TenantPluginOptions = {}) {
    return createTenantPlugin(this, options);
  }

  /** Drizzle table of the tenant registry in the base schema. */
  tenantEntity() {
    return buildTenantEntity(this.schema);
  }

  /** Reloads the registry (multi-tenant only). */
  async refreshTenantPools(): Promise<void> {
    if (!this.isTenantMode) {
      return;
    }
    await this.pools.syncTenantPools();
  }

  /** Ids of the tenants with an open pool. */
  tenantIds(): string[] {
    return this.pools.readTenantIds();
  }

  /** Stops the listener and closes every pool. */
  async close(): Promise<void> {
    await this.listener.stop();
    await this.pools.closeAll();
    this.isTenantMode = false;
    this.initPromise = null;
  }
}

export { CORE_TENANT_ID, isCoreTenant } from "./pool-manager.ts";

export type { TenantTaskOptions };
