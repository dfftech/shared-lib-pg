---
name: shared-bun-elysia
description: >
  How to build a Bun + Elysia 2.0 backend service on the object oriented shared-bun-elysia library: one AppConfig
  (written in config.ts straight from process.env), Application (Database, Kafka, appPlugin, modules from config),
  IModule classes with constructor injection, database.tenantPlugin (multi-tenant PostgreSQL + Drizzle),
  DrizzleRepository, multi-tenant Kafka logs, AppError + ResponseType replies, JWT / authPlugin, AppHttp.
  Use with elysia-module-skill.md for module files and dff-code-style-skill.md for code style.
---

# shared-bun-elysia — service guide

The service owns ONLY: `src/config.ts`, `src/main.ts`, `src/modules/*`, SQL migrations and `.env`.
Never re-implement in a service: env parsing, request id / tenant / branch headers, logging, Kafka logging, log
masking, error replies, reply meta, tenant database routing, pools, transactions, JWT, outgoing service calls.

## Files a service has

```
src/
├── config.ts     export const appConfig: AppConfig = { db: { url: parseText(process.env.CORE_DB_URL, ""), ... },
│                 ..., modules: MODULES };   MODULES: [{ name: "user", module: UserModule }, ...]
│                 (the ONLY env read of the service: process.env directly, every AppConfig field written out)
├── main.ts       const application = new Application(appConfig); await application.start();
└── modules/...   see elysia-module-skill.md
sql/              migrations (tables are never created from Drizzle entities)
.env              BASE_NAME + prefixed keys (README "Config")
```

## Rules

- Config: everything comes from `appConfig`. No `process.env` outside `config.ts`; there, env text becomes typed values
  with `parseText / parseNumber / parseBoolean / parseList / parseLogLevel / parseKafkaSasl`. Library and modules
  read `readAppConfig()` when they need a setting.
- Modules: one line in `MODULES`; turn one off with `isEnabled: false` or `disabledModules` (env `CORE_MODULES_DISABLED`). Application creates
  `new XModule(database)` and calls `register(app)`. `appPlugin()` is added by Application, never by a module.
- Constructor injection only: module builds `Repository(database)` -> `Service(repository, otherServices)` ->
  `Controller(service)`. DTO and mapper classes are static.
- A module with database routes adds `this.database.tenantPlugin()` on its own Elysia instance. Repositories query
  `this.Db(transaction)` (the transaction, else the tenant database of the request). `database.core()` only for the
  registry / base data.
- Verified user: `authPlugin()` / `authPlugin({ roles })` on the module's instance. `appPlugin()` only decodes the token.
- Handlers have NO try / catch. Expected failure: `throw new AppError("CODE")` (200 `{ data: null, error }`) or
  `new AppError("CODE", 404)`. Anything else becomes a logged 500. Schema errors are 422 `INVALID_DATA`.
- Transactions are opened by services: `const transaction = await this.repository.Begin()`, pass it to every write
  (also to other modules' services), `commit()`, `rollback()` in the catch. Never write an own ITransaction.
- Logging: `const logger = readLogger(); logger.info("Saved user", { id });` — never `console.log`. Data is masked by
  key (`log.maskKeys`). Kafka logs follow `kafka.log` (topic `app-logs` or `app-logs-{tenant}`, key = tenant id).
- Work outside a request (Kafka consumer, cron): `application.database.runWithTenant(tenantId, task, ...args)`;
  consumers with `application.kafka.startConsumer({ topic, groupId, onMessage })`.
- Other services: `AppHttp.Get / Post / Put / Delete` (passes token, request-id, tenant, branch).
- Reply status texts: `SAVED_SUCCESSFULLY`, `LISTED_SUCCESSFULLY`, `LOADED_SUCCESSFULLY`, `DELETED_SUCCESSFULLY`.

## Elysia 2.0

- Route order is `(path, hook, handler)`: `app.post("/x-save", { body: XDto.SaveSchema }, saveX)`.
- Plugin scope `'scoped'` is now `'plugin'`. Schema types: `Static<typeof XDto.SaveSchema>` from `shared-bun-elysia`.
- In `onError` use `status(code, body)`; `set.status = 200` is ignored there (the library does this for you).

## Multi-tenant model

Registry table `{schema}.tenants (id, name, db, active, ...)` in the base database (`db.url`, schema from
`?options=-c%20search_path%3D<schema>`). Each `db` is a tenant connection URL (own server, database or schema).
Tenant `"core"` = base database. Pools follow the table through a trigger + LISTEN; `database.refreshTenantPools()`
forces it.
