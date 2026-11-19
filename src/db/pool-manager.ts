// pool-manager.ts
// The pg pools of a Database: one for the base database (config db.url) and one per tenant. The tenant registry is
// the table {schema}.tenants (id, db, active ...) in the base database; "db" is the tenant's connection URL.
// Every new connection runs "SET search_path" of its schema (from the URL options) before its first query.
// Connection URLs are never logged.

import { Pool, type ClientBase } from "pg";
import type { DbConfig } from "../config/app-config.ts";
import { appLogger } from "../logging/app-logger.ts";
import { readErrorText } from "../utils/text-util.ts";
import { parseConnectionUrl, quoteIdentifier, type ParsedConnectionUrl } from "./db-url.ts";

type TenantRow = {
  id: string;
  db: string;
};

/** Reserved tenant id: always the base database, never read from the registry. */
export const CORE_TENANT_ID = "core";

/** True for the reserved "core" tenant id (any case). */
export function isCoreTenant(tenantId?: string): boolean {
  const text = tenantId ?? "";
  const trimmedText = text.trim();
  return trimmedText.toLowerCase() === CORE_TENANT_ID;
}

/** pg-pool onConnect hook: runs before a new connection is handed out (a failure ends that connection). */
async function applySearchPath(label: string, searchPath: string, client: ClientBase): Promise<void> {
  const schemaName = quoteIdentifier(searchPath);
  try {
    await client.query(`SET search_path = ${schemaName}`);
  } catch (error) {
    const errorText = readErrorText(error);
    appLogger.error("db: set search_path failed", { pool: label, error: errorText });
    throw error;
  }
}

function handlePoolError(label: string, error: Error): void {
  appLogger.error("db: pool error", { pool: label, error: error.message });
}

export class PoolManager {
  private readonly config: DbConfig;

  private readonly coreUrl: ParsedConnectionUrl;

  private corePool: Pool | null = null;

  /** tenantId -> pool. */
  private readonly tenantPools = new Map<string, Pool>();

  /** tenantId -> raw connection URL (to see URL changes). */
  private readonly tenantUrls = new Map<string, string>();

  constructor(config: DbConfig) {
    this.config = config;
    this.coreUrl = parseConnectionUrl(config.url);
  }

  /** Schema of the base database (search_path of db.url, default public). */
  get schema(): string {
    return this.coreUrl.searchPath;
  }

  /** Base database URL without options (for the LISTEN connection). */
  get coreConnectionUrl(): string {
    return this.coreUrl.url;
  }

  /** True when db.url is set. */
  get isConfigured(): boolean {
    return this.coreUrl.url !== "";
  }

  /** New pool; every new connection runs SET search_path before its first query. */
  createPool(connectionUrl: string, label: string, searchPath: string): Pool {
    const onConnect = applySearchPath.bind(null, label, searchPath);
    const pool = new Pool({
      connectionString: connectionUrl,
      max: this.config.poolSize,
      idleTimeoutMillis: this.config.idleTimeoutMs,
      connectionTimeoutMillis: this.config.connectTimeoutMs,
      allowExitOnIdle: true,
      onConnect,
    });
    const onError = handlePoolError.bind(null, label);
    pool.on("error", onError);
    return pool;
  }

  /** Pool of the base database (created on first use). Throws when db.url is not set. */
  readCorePool(): Pool {
    if (this.corePool !== null) {
      return this.corePool;
    }
    if (!this.isConfigured) {
      throw new Error("DB_URL is not set (config db.url)");
    }
    this.corePool = this.createPool(this.coreUrl.url, CORE_TENANT_ID, this.coreUrl.searchPath);
    appLogger.info("db: core pool created", { schema: this.coreUrl.searchPath });
    return this.corePool;
  }

  /** Active tenants of the registry: tenantId -> raw connection URL ("core" rows are left out). */
  async loadTenantMap(): Promise<Map<string, string>> {
    const pool = this.readCorePool();
    const result = await pool.query<TenantRow>("SELECT id, db FROM tenants WHERE active = true");
    const tenantMap = new Map<string, string>();
    for (const row of result.rows) {
      const isCore = isCoreTenant(row.id);
      if (!isCore) {
        tenantMap.set(row.id, row.db);
      }
    }
    return tenantMap;
  }

  private createTenantPool(tenantId: string, rawUrl: string): Pool {
    const parsed = parseConnectionUrl(rawUrl);
    const pool = this.createPool(parsed.url, `tenant:${tenantId}`, parsed.searchPath);
    this.tenantPools.set(tenantId, pool);
    this.tenantUrls.set(tenantId, rawUrl);
    appLogger.info("db: tenant pool created", { tenant_id: tenantId, schema: parsed.searchPath });
    return pool;
  }

  private async removeTenantPool(tenantId: string): Promise<void> {
    const pool = this.tenantPools.get(tenantId);
    this.tenantPools.delete(tenantId);
    this.tenantUrls.delete(tenantId);
    if (pool === undefined) {
      return;
    }
    await pool.end();
    appLogger.info("db: tenant pool removed", { tenant_id: tenantId });
  }

  /** Cached pool of a tenant, or a new one from the registry; undefined when the tenant is not active. */
  async findTenantPool(tenantId: string): Promise<Pool | undefined> {
    const cachedPool = this.tenantPools.get(tenantId);
    if (cachedPool !== undefined) {
      return cachedPool;
    }
    const tenantMap = await this.loadTenantMap();
    const rawUrl = tenantMap.get(tenantId);
    if (rawUrl === undefined) {
      return undefined;
    }
    const racedPool = this.tenantPools.get(tenantId);
    if (racedPool !== undefined) {
      return racedPool;
    }
    return this.createTenantPool(tenantId, rawUrl);
  }

  /**
   * Reloads the registry and syncs the pools: adds new active tenants, recreates a pool when its URL changed,
   * removes pools of inactive or deleted tenants.
   */
  async syncTenantPools(): Promise<void> {
    const nextMap = await this.loadTenantMap();
    const currentIds = this.readTenantIds();
    for (const tenantId of currentIds) {
      const isStillActive = nextMap.has(tenantId);
      if (!isStillActive) {
        await this.removeTenantPool(tenantId);
      }
    }
    for (const [tenantId, rawUrl] of nextMap) {
      const previousUrl = this.tenantUrls.get(tenantId);
      const hasPool = this.tenantPools.has(tenantId);
      if (hasPool && previousUrl === rawUrl) {
        continue;
      }
      if (hasPool) {
        await this.removeTenantPool(tenantId);
      }
      this.createTenantPool(tenantId, rawUrl);
    }
    const tenantIds = this.readTenantIds();
    appLogger.info("db: tenant pools synced", { count: tenantIds.length, tenant_ids: tenantIds });
  }

  /** Ids of the tenants with an open pool. */
  readTenantIds(): string[] {
    const tenantIds: string[] = [];
    for (const tenantId of this.tenantPools.keys()) {
      tenantIds.push(tenantId);
    }
    return tenantIds;
  }

  /** Closes every pool (base and tenants). */
  async closeAll(): Promise<void> {
    const pools: Pool[] = [];
    if (this.corePool !== null) {
      pools.push(this.corePool);
    }
    for (const pool of this.tenantPools.values()) {
      pools.push(pool);
    }
    this.corePool = null;
    this.tenantPools.clear();
    this.tenantUrls.clear();
    const endPromises: Promise<void>[] = [];
    for (const pool of pools) {
      const endPromise = pool.end();
      endPromises.push(endPromise);
    }
    await Promise.all(endPromises);
  }
}
