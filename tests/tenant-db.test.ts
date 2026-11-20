// tenant-db.test.ts — multi-tenant PostgreSQL end to end, on in-process PGlite servers (no Docker needed):
// one base database with core.tenants and two tenant databases. Checks tenant routing and isolation,
// registry sync, "core", runWithTenant, transactions and search paging. LISTEN / NOTIFY is not tested here
// (PGlite has one backend); database.refreshTenantPools() is called directly instead.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { eq } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";
import {
  AppError,
  Database,
  DrizzleRepository,
  TransactionManager,
  appPlugin,
  buildSearchWhere,
  core_db,
  deleteRowById,
  findRowById,
  get_db,
  insertRow,
  readDbExecutor,
  readSessionDb,
  runInTransaction,
  searchPage,
  searchRows,
  session_db,
  tenant_ids,
  updateRowById,
  type AppTransactionDb,
} from "../src/index.ts";
import { TEST_CONFIG } from "./test-config.ts";

type TestDatabase = {
  pglite: PGlite;
  server: PGLiteSocketServer;
  url: string;
};

type Reply = Record<string, any>;

const cityEntity = pgTable("cities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const databases: TestDatabase[] = [];

/** The Database under test; built in startDatabases once the base URL is known. */
let database: Database;

async function startTestDatabase(setupSql: string): Promise<TestDatabase> {
  const pglite = await PGlite.create();
  await pglite.exec(setupSql);
  const server = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  const connection = server.getServerConn();
  const database = { pglite, server, url: `postgresql://postgres:postgres@${connection}/postgres` };
  databases.push(database);
  return database;
}

const TENANT_SQL = `
  CREATE TABLE cities (id text PRIMARY KEY, name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
`;

function buildCoreSql(acmeUrl: string, globexUrl: string): string {
  return `
    CREATE SCHEMA core;
    CREATE TABLE core.tenants (
      id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'test',
      updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL DEFAULT 'test',
      active boolean NOT NULL DEFAULT true, name text NOT NULL, db text NOT NULL
    );
    INSERT INTO core.tenants (id, name, db) VALUES ('acme', 'Acme', '${acmeUrl}'), ('globex', 'Globex', '${globexUrl}');
    CREATE TABLE core.cities (id text PRIMARY KEY, name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
  `;
}

async function handleSave(context: { body: { id: string; name: string } }): Promise<Reply> {
  const db = readSessionDb();
  await db.insert(cityEntity).values(context.body);
  return { data: context.body };
}

async function handleSearch(context: { body: { searchTerm?: string; limit?: number } }): Promise<Reply> {
  const db = readSessionDb();
  return searchPage(db, cityEntity, context.body);
}

async function insertThenFail(db: AppTransactionDb, id: string): Promise<void> {
  await db.insert(cityEntity).values({ id, name: "Rolled back" });
  throw new AppError("STOP");
}

async function handleTransaction(context: { body: { id: string } }): Promise<Reply> {
  await runInTransaction(insertThenFail, context.body.id);
  return { data: true };
}

async function handleDatabaseHelpers(): Promise<Reply> {
  const coreDatabase = core_db();
  const requestDatabase = session_db();
  const selectedTenantDatabase = await get_db("globex");
  const expectedCoreDatabase = database.core();
  const expectedRequestDatabase = database.session();
  const expectedTenantDatabase = await database.tenant("globex");
  return {
    data: {
      core: coreDatabase.$client === expectedCoreDatabase.$client,
      session: requestDatabase.$client === expectedRequestDatabase.$client,
      tenant: selectedTenantDatabase.$client === expectedTenantDatabase.$client,
      tenantIds: tenant_ids(),
    },
  };
}

function buildApp() {
  const tenantDb = database.tenantPlugin();
  const cityApi = new Elysia()
    .use(tenantDb)
    .post("/city-save", { body: t.Object({ id: t.String(), name: t.String() }) }, handleSave)
    .post("/city-search", { body: t.Object({ searchTerm: t.Optional(t.String()), limit: t.Optional(t.Number()) }) }, handleSearch)
    .post("/city-transaction", { body: t.Object({ id: t.String() }) }, handleTransaction)
    .post("/db-helper", handleDatabaseHelpers);
  return new Elysia().use(appPlugin()).use(cityApi);
}

let app: ReturnType<typeof buildApp>;

async function post(path: string, body: unknown, tenantId?: string): Promise<{ status: number; body: Reply }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (tenantId !== undefined) {
    headers["x-tenant-id"] = tenantId;
  }
  const request = new Request(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const response = await app.handle(request);
  const replyBody = (await response.json()) as Reply;
  return { status: response.status, body: replyBody };
}

async function startDatabases(): Promise<void> {
  const acme = await startTestDatabase(TENANT_SQL);
  const globex = await startTestDatabase(TENANT_SQL);
  const coreSql = buildCoreSql(acme.url, globex.url);
  const core = await startTestDatabase(coreSql);
  const dbConfig = { ...TEST_CONFIG.db, url: `${core.url}?options=-c%20search_path%3Dcore` };
  database = new Database(dbConfig);
  await database.init();
  app = buildApp();
}

async function stopDatabases(): Promise<void> {
  await database.close();
  for (const database of databases) {
    await database.server.stop();
    await database.pglite.close();
  }
}

function testDetectsTenants(): void {
  expect(database.isMultiTenant).toBe(true);
  const tenantIds = database.tenantIds();
  tenantIds.sort();
  expect(tenantIds).toEqual(["acme", "globex"]);
}

async function testTenantIsolation(): Promise<void> {
  const saveAcme = await post("/city-save", { id: "c1", name: "Paris" }, "acme");
  expect(saveAcme.status).toBe(200);
  await post("/city-save", { id: "c1", name: "Berlin" }, "globex");
  await post("/city-save", { id: "c2", name: "Lyon" }, "acme");
  const acmePage = await post("/city-search", {}, "acme");
  expect(acmePage.body.total).toBe(2);
  const globexPage = await post("/city-search", { searchTerm: "ber" }, "globex");
  expect(globexPage.body.total).toBe(1);
  expect(globexPage.body.data[0].name).toBe("Berlin");
  expect(typeof globexPage.body.data[0].updatedAt).toBe("string");
  const pagedAcme = await post("/city-search", { limit: 1 }, "acme");
  expect(pagedAcme.body.data.length).toBe(1);
  expect(pagedAcme.body.total).toBe(2);
}

async function testTenantErrors(): Promise<void> {
  const missing = await post("/city-search", {});
  expect(missing.status).toBe(400);
  expect(missing.body.error).toBe("TENANT_REQUIRED");
  const unknown = await post("/city-search", {}, "initech");
  expect(unknown.status).toBe(404);
  expect(unknown.body.error).toBe("TENANT_NOT_FOUND");
}

async function testCoreTenant(): Promise<void> {
  await post("/city-save", { id: "k1", name: "Core City" }, "core");
  const corePage = await post("/city-search", {}, "core");
  expect(corePage.body.total).toBe(1);
  expect(corePage.body.data[0].name).toBe("Core City");
}

async function testDatabaseHelpers(): Promise<void> {
  const reply = await post("/db-helper", {}, "acme");
  expect(reply.status).toBe(200);
  expect(reply.body.data).toEqual({ core: true, session: true, tenant: true, tenantIds: ["acme", "globex"] });
}

async function countCities(): Promise<number> {
  const db = readSessionDb();
  const rows = await db.select().from(cityEntity);
  return rows.length;
}

async function testRunWithTenant(): Promise<void> {
  const acmeCount = await database.runWithTenant("acme", countCities);
  expect(acmeCount).toBe(2);
  const globexCount = await database.runWithTenant("globex", countCities);
  expect(globexCount).toBe(1);
}

async function testTransactionRollback(): Promise<void> {
  const reply = await post("/city-transaction", { id: "c9" }, "acme");
  expect(reply.body.error).toBe("STOP");
  const acmeCount = await database.runWithTenant("acme", countCities);
  expect(acmeCount).toBe(2);
}

async function repositoryRoundTrip(): Promise<string[]> {
  const db = readDbExecutor();
  const steps: string[] = [];
  const inserted = await insertRow(db, cityEntity, { id: "r1", name: "Oslo" });
  steps.push(inserted.name);
  const updated = await updateRowById(db, cityEntity, "r1", { name: "Bergen" });
  steps.push(updated?.name ?? "missing");
  const found = await findRowById(db, cityEntity, "r1");
  steps.push(found?.name ?? "missing");
  const isDeleted = await deleteRowById(db, cityEntity, "r1");
  steps.push(String(isDeleted));
  const gone = await findRowById(db, cityEntity, "r1");
  steps.push(gone === undefined ? "gone" : "still there");
  const missingUpdate = await updateRowById(db, cityEntity, "nope", { name: "x" });
  steps.push(missingUpdate === undefined ? "no row" : "row");
  return steps;
}

async function searchCityRows(): Promise<Array<Record<string, unknown>>> {
  const db = readDbExecutor();
  const input = { searchTerm: "par" };
  const where = buildSearchWhere(cityEntity, input, ["name"]);
  const page = await searchRows(db, cityEntity, input, where);
  return page.data;
}

async function testSearchRows(): Promise<void> {
  const rows = await database.runWithTenant("acme", searchCityRows);
  expect(rows.length).toBe(1);
  expect(rows[0]?.name).toBe("Paris");
  expect(rows[0]?.updated_at).toBeInstanceOf(Date);
}

async function testRepositoryHelpers(): Promise<void> {
  const steps = await database.runWithTenant("acme", repositoryRoundTrip);
  expect(steps).toEqual(["Oslo", "Bergen", "Bergen", "true", "gone", "no row"]);
}

/** Insert in a transaction, then commit or roll back; true when the row is kept only after a commit. */
async function repositoryTransaction(isCommitted: boolean): Promise<boolean> {
  const transaction = await TransactionManager.begin();
  const transactionDb = readDbExecutor(transaction);
  await insertRow(transactionDb, cityEntity, { id: "t1", name: "Transaction City" });
  const insideRow = await findRowById(transactionDb, cityEntity, "t1");
  if (isCommitted) {
    await transaction.commit();
  } else {
    await transaction.rollback();
  }
  const requestDb = readDbExecutor();
  const outsideRow = await findRowById(requestDb, cityEntity, "t1");
  if (outsideRow !== undefined) {
    await deleteRowById(requestDb, cityEntity, "t1");
  }
  return insideRow !== undefined && (outsideRow !== undefined) === isCommitted;
}

async function testRepositoryTransaction(): Promise<void> {
  expect(await database.runWithTenant("acme", repositoryTransaction, false)).toBe(true);
  expect(await database.runWithTenant("acme", repositoryTransaction, true)).toBe(true);
  expect(await database.runWithTenant("acme", countCities)).toBe(2);
}

/** Repository of the test table, the way a module writes one. */
class CityRepository extends DrizzleRepository<typeof cityEntity> {
  constructor(repositoryDatabase: Database) {
    super(repositoryDatabase, cityEntity);
  }
}

async function cityRepositoryRoundTrip(): Promise<string[]> {
  const repository = new CityRepository(database);
  const steps: string[] = [];
  const transaction = await database.begin();
  const created = await repository.Create({ id: "d1", name: "Delft" }, transaction);
  steps.push(created.name);
  await transaction.commit();
  const updated = await repository.UpdateById("d1", { name: "Den Haag" });
  steps.push(updated?.name ?? "missing");
  const page = await repository.SearchRows({ limit: 50 });
  steps.push(String(page.total));
  const isDeleted = await repository.DeleteById("d1");
  steps.push(String(isDeleted));
  const gone = await repository.FindById("d1");
  steps.push(gone === undefined ? "gone" : "still there");
  return steps;
}

async function testDrizzleRepository(): Promise<void> {
  const steps = await database.runWithTenant("acme", cityRepositoryRoundTrip);
  expect(steps).toEqual(["Delft", "Den Haag", "3", "true", "gone"]);
}

async function testRegistrySync(): Promise<void> {
  const tenantEntity = database.tenantEntity();
  const coreDb = database.core();
  const globexMatch = eq(tenantEntity.id, "globex");
  await coreDb.update(tenantEntity).set({ active: false }).where(globexMatch);
  await database.refreshTenantPools();
  expect(database.tenantIds()).toEqual(["acme"]);
  const removed = await post("/city-search", {}, "globex");
  expect(removed.body.error).toBe("TENANT_NOT_FOUND");
  await coreDb.update(tenantEntity).set({ active: true }).where(globexMatch);
  const back = await post("/city-search", {}, "globex");
  expect(back.body.total).toBe(1);
}

describe("multi-tenant database", () => {
  beforeAll(startDatabases);
  afterAll(stopDatabases);
  it("detects multi-tenant and opens a pool per active tenant", testDetectsTenants);
  it("routes every request to its tenant database", testTenantIsolation);
  it("400 without tenant, 404 for an unknown tenant", testTenantErrors);
  it('"core" is the base database', testCoreTenant);
  it("app-util returns the core, request and selected tenant databases", testDatabaseHelpers);
  it("runWithTenant gives background work the tenant database", testRunWithTenant);
  it("runInTransaction rolls back on error", testTransactionRollback);
  it("searchRows returns entity rows (snake_case) for a mapper", testSearchRows);
  it("repository helpers: insert, update, find, delete by id", testRepositoryHelpers);
  it("repository helpers join a transaction (rollback drops, commit keeps)", testRepositoryTransaction);
  it("DrizzleRepository subclass: create in a transaction, update, search, delete", testDrizzleRepository);
  it("syncs pools with the tenants registry", testRegistrySync);
});
