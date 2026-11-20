// tenant-listener.ts
// Keeps the tenant pools of a Database in sync with the registry without a restart: a trigger on {schema}.tenants
// sends pg_notify("tenant_change", { op, id, active }) and a dedicated LISTEN connection resyncs the pools.
// The payload never holds a connection URL. A lost LISTEN connection is opened again after 5 seconds.

import { Client, type Notification } from "pg";
import { appLogger } from "../logging/app-logger.ts";
import { readErrorText } from "../utils/text-util.ts";
import { quoteIdentifier } from "./db-url.ts";
import type { PoolManager } from "./pool-manager.ts";

export const TENANT_CHANGE_CHANNEL = "tenant_change";

const TRIGGER_NAME = "tenants_notify_trigger";

const FUNCTION_NAME = "notify_tenant_change";

const RECONNECT_DELAY_MS = 5_000;

/** Log-safe summary of a notify payload (op, id, active only). */
export function readNotifySummary(payload?: string): Record<string, unknown> {
  if (payload === undefined || payload === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return { op: parsed.op, id: parsed.id, active: parsed.active };
  } catch {
    return { payload: "(unparsed)" };
  }
}

function ignoreError(): void {
  // The client is closed already.
}

function handleSyncError(error: unknown): void {
  const errorText = readErrorText(error);
  appLogger.error("db: tenant pool sync after change failed", { error: errorText });
}

export class TenantChangeListener {
  private readonly pools: PoolManager;

  private readonly applicationName: string;

  private client: Client | null = null;

  private isStarted = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(pools: PoolManager, applicationName: string) {
    this.pools = pools;
    this.applicationName = applicationName;
  }

  private async hasTrigger(): Promise<boolean> {
    const pool = this.pools.readCorePool();
    const result = await pool.query({
      text: `
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = 'tenants' AND t.tgname = $2 AND NOT t.tgisinternal
        LIMIT 1
      `,
      values: [this.pools.schema, TRIGGER_NAME],
    });
    return (result.rowCount ?? 0) > 0;
  }

  /** Creates the notify function and the AFTER INSERT / UPDATE / DELETE trigger on {schema}.tenants (once). */
  async ensureTrigger(): Promise<void> {
    const schemaName = quoteIdentifier(this.pools.schema);
    const functionName = quoteIdentifier(FUNCTION_NAME);
    const tenantTable = quoteIdentifier("tenants");
    const pool = this.pools.readCorePool();
    await pool.query(`
      CREATE OR REPLACE FUNCTION ${schemaName}.${functionName}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        payload text;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          payload := json_build_object('op', TG_OP, 'id', OLD.id)::text;
        ELSE
          payload := json_build_object('op', TG_OP, 'id', NEW.id, 'active', NEW.active)::text;
        END IF;
        PERFORM pg_notify('${TENANT_CHANGE_CHANNEL}', payload);
        RETURN COALESCE(NEW, OLD);
      END;
      $fn$;
    `);
    const hasTrigger = await this.hasTrigger();
    if (hasTrigger) {
      return;
    }
    const triggerName = quoteIdentifier(TRIGGER_NAME);
    await pool.query(`
      CREATE TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE OR DELETE ON ${schemaName}.${tenantTable}
      FOR EACH ROW
      EXECUTE PROCEDURE ${schemaName}.${functionName}();
    `);
    appLogger.info("db: tenant change trigger created", { schema: this.pools.schema });
  }

  /** Trigger + LISTEN, once. */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }
    await this.ensureTrigger();
    this.isStarted = true;
    await this.open();
  }

  /** Stops listening. */
  async stop(): Promise<void> {
    this.isStarted = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    if (client === null) {
      return;
    }
    try {
      await client.query(`UNLISTEN ${TENANT_CHANGE_CHANNEL}`);
    } catch {
      // The client may be closed already.
    }
    const endPromise = client.end();
    endPromise.catch(ignoreError);
    await endPromise;
  }

  private async open(): Promise<void> {
    if (!this.isStarted || this.client !== null) {
      return;
    }
    const client = new Client({
      connectionString: this.pools.coreConnectionUrl,
      application_name: `${this.applicationName}-tenant-listener`,
    });
    let listener: { database: string; backend_pid: number; channels: string[] } | undefined;
    try {
      await client.connect();
      this.client = client;
      const onNotification = this.handleNotification.bind(this);
      client.on("notification", onNotification);
      const onError = this.handleError.bind(this, client);
      client.on("error", onError);
      const onEnd = this.handleEnd.bind(this, client);
      client.on("end", onEnd);
      await client.query(`LISTEN ${TENANT_CHANGE_CHANNEL}`);
      const result = await client.query<{
        database: string;
        backend_pid: number;
        channels: string[];
      }>(`
        SELECT current_database() AS database,
          pg_backend_pid() AS backend_pid,
          ARRAY(SELECT pg_listening_channels()) AS channels
      `);
      listener = result.rows[0];
      if (listener === undefined || !listener.channels.includes(TENANT_CHANGE_CHANNEL)) {
        throw new Error(`PostgreSQL session is not listening on ${TENANT_CHANGE_CHANNEL}`);
      }
    } catch (error) {
      const errorText = readErrorText(error);
      appLogger.error("db: tenant change listener connect failed", { error: errorText });
      if (this.client === client) {
        this.client = null;
      }
      const endPromise = client.end();
      endPromise.catch(ignoreError);
      this.scheduleReconnect();
      return;
    }
    await this.pools.syncTenantPools();
    appLogger.info("db: listening for tenant changes", {
      channel: TENANT_CHANGE_CHANNEL,
      database: listener?.database,
      backend_pid: listener?.backend_pid,
      channels: listener?.channels,
    });
  }

  private handleNotification(message: Notification): void {
    if (message.channel !== TENANT_CHANGE_CHANNEL) {
      return;
    }
    const summary = readNotifySummary(message.payload);
    appLogger.info("db: tenants table changed", summary);
    const syncPromise = this.pools.syncTenantPools();
    syncPromise.catch(handleSyncError);
  }

  private handleEnd(client: Client): void {
    if (this.client !== client) {
      return;
    }
    this.client = null;
    appLogger.warn("db: tenant change listener closed, reconnecting");
    this.scheduleReconnect();
  }

  private handleError(client: Client, error: Error): void {
    appLogger.error("db: tenant change listener error", { error: error.message });
    this.handleEnd(client);
    const endPromise = client.end();
    endPromise.catch(ignoreError);
  }

  private handleReconnectTimer(): void {
    this.reconnectTimer = null;
    void this.open();
  }

  private scheduleReconnect(): void {
    if (!this.isStarted || this.reconnectTimer !== null) {
      return;
    }
    const onTimer = this.handleReconnectTimer.bind(this);
    this.reconnectTimer = setTimeout(onTimer, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref();
  }
}
