# Coding rules for shared-bun-elysia

The same rules as `shared-lib-web`, so the code is easy to read for **people and AI tools**.
`bun run check:style` checks rules 1–3 and 10 (file names) in `src/` and `example/src/` and fails the build when one is broken.

## 1. No nested functions

Write every function at the top level of the file or as a class method. No arrow function inside a function,
method, handler or service.

```ts
// ❌ Bad
register(app: Elysia): void {
  app.post("/user-save", async ({ body }) => ({ data: await this.service.SaveService(body) }));
}

// ✅ Good
async SaveUser(context: { body: UserSaveDto }): Promise<ResponseType> {
  const data = await this.service.SaveService(context.body);
  return { data, status: SAVED_SUCCESSFULLY };
}

register(app: Elysia): void {
  const saveUser = this.SaveUser.bind(this);
  app.post("/user-save", { body: UserDto.SaveSchema }, saveUser);
}
```

| Need | Pattern |
| --- | --- |
| Route handler | Controller method, bound once in `register`: `const saveUser = this.SaveUser.bind(this)` |
| Callback that needs `this` (timer, `client.on`) | `const onTimer = this.flush.bind(this)` |
| Callback with a value (`pool.on`, `consumer.run`) | Top-level function + `handleX.bind(null, value)` |
| Work in a transaction | `const transaction = await this.repository.Begin()` + try / commit / catch rollback |
| Background work for a tenant | `database.runWithTenant("acme", syncOrders, ids)` |
| `.catch(...)` | `promise.catch(handleLoadError)` |

## 2. No call inside a call

```ts
// ❌ Bad
const rows = await db.select().from(addressEntity).where(eq(addressEntity.id, id));
logger.info(JSON.stringify(entry));

// ✅ Good
const idMatch = eq(addressEntity.id, id);
const rows = await db.select().from(addressEntity).where(idMatch);
const line = JSON.stringify(entry);
logger.info(line);
```

Calls inside object literals are allowed (`{ id: randomUUID() }`), but prefer a named const for anything non-trivial.
**Backend exception:** schema builders may nest: `t.Optional(t.String())`.

## 3. No chained calls

```ts
// ❌ Bad
const code = readCode().toLowerCase();

// ✅ Good
const rawCode = readCode();
const code = rawCode.toLowerCase();
```

**Backend exception:** builder chains read like a route table or a SQL statement, so they are allowed:

- Elysia: `new Elysia().use(appPlugin()).get(...).post(...)` (`use`, `get`, `post`, `derive`, `onError` ...)
- Drizzle queries: `db.select().from(t).where(w).orderBy(o).limit(10)`, `db.update(t).set(v).where(w)`
- Drizzle columns: `text("id").primaryKey()`, `timestamp("created_at").notNull().defaultNow()`

The allowed method names are the `BUILDER_METHODS` list in `scripts/check-code-style.mjs`.

## 4. Lists with `for ... of`

Build lists with `for ... of` and `push`, not `.map()` / `.filter()` with an inline arrow.
`toViewMapper(rows)` maps a whole list already.

## 5. Object oriented modules

A service is an `Application` built from one config; each feature is a module class. Module and file names are
**singular** (`user`, not `users`).

```
modules/{module}/
├── {module}.module.ts      class {Module}Module implements IModule: builds the chain in its constructor, register(app)
├── {module}.controller.ts  class {Module}Controller(service): route handlers + register(app: Elysia)
├── {module}.service.ts     class {Module}Service(repository, other services): rules, transactions, order of the steps
├── {module}.repository.ts  class {Module}Repository(database) extends DrizzleRepository: the ONLY Drizzle code
├── {module}.mapper.ts      static class {Module}Mapper: FromDto, ToEntity, ToView, ToViewList, ToViewPage (pure)
├── {module}.dto.ts         static class {Module}Dto: SaveSchema, SearchSchema, IdParamsSchema + types + {Module}View
└── {module}.entity.ts      Drizzle table ({module}Entity), snake_case columns, only for queries
```

- Dependencies go in through constructors, exactly in this chain (the module is the only place that uses `new` for
  them): `new XRepository(database)` → `new XService(repository)` → `new XController(service)`.
- `XModule.register(app)` makes the module's own `new Elysia({ name: "x-routes" })`, adds its plugins
  (`this.database.tenantPlugin()`), lets the controller register its routes on it, then `app.use(routes)`.
- The module is listed once in the app's `config.ts` (`{ name: "x", module: XModule }`); `Application` creates it with
  `new XModule(database)` and registers it. Nothing else imports a module.
- A service calls its own repository / mapper and the **services** of other modules (built in the module constructor),
  never another module's repository or mapper.
- Repositories return entities; services return views. Every repository method takes `transaction?: ITransaction`
  last. A service that writes more than one row opens `this.repository.Begin()` and passes it to every write.
- DTO and mapper classes are **static** (never `new`); mappers are pure: no database, no request context.
- Routes: kebab-case `/{module}-save`, `/{module}-search`, `/{module}-entity/:id`. Handlers are PascalCase controller
  methods (`SaveUser`, `SearchUsers`, `EntityByIdUser`), thin, no try / catch. `ResponseType` only in controllers.
- Entities never change the database (no drizzle-kit push / migrate). Tables come from SQL migrations.

## 5b. Import paths with extensions

Relative imports use the real file name: `import { AddressService } from "./address.service.ts";`.
`tsc` rewrites them to `.js` when it builds `dist/`.

## 6. Use dff-util and this library first

Before writing a constant, type or helper, use `dff-util` (`ResponseType`, `SessionInfo`, `SearchType`, `ConstKeys`,
`RegExp.EMAIL`, `QueryCond` ...) and this library (`DrizzleRepository`, `buildSearchWhere`, `buildAuditColumns`,
`readText`, `AppError`, `SAVED_SUCCESSFULLY` ...).

## 7. Config, never env; request context, never module state

- Environment variables are read **only** in the app's `config.ts`, directly from `process.env`, into one
  `AppConfig` object (`parseNumber(process.env.CORE_DB_POOL_SIZE, 10)` ...). Library classes and modules read
  `readAppConfig()` or get the config / `Database` in a constructor. No `process.env` anywhere else.
- Per-request values come from the request context (`readTenantId()`, `readSessionUser()`, `readLogger()` ...) or the
  handler context. Never keep them in fields or module variables: requests run at the same time. Class fields hold
  only dependencies (repository, service, database) set in the constructor.

## 8. Named exports only

`export class X`, `export function X` and `import { X }`. No default exports (config files of tools excepted).

## 9. Clear names and comments

Every file starts with a short comment saying what it does. Every exported function has a `/** ... */` line.
Booleans start with `is`, `has`, `can` or `show`.

## 10. File names: lowercase with "-"

Every file and folder name is lowercase words joined with `-`. A `.` separates a role suffix:
`app-plugin.ts`, `request-context.ts`, `user.controller.ts`, `user.module.ts`, `kafka-log-queue.test.ts`, `0000-core.sql`.
Not allowed: `AppPlugin.ts`, `requestContext.ts`, `address_service.ts`.

## 11. Tests

Tests live in `tests/` and run on Bun's test runner (`bun test`) with the test config (`tests/test-config.ts`, no env).
Import `describe`, `it`, `expect` from `bun:test`.
Use named top-level test functions: `it("routes every request to its tenant database", testTenantIsolation)`.
`expect(...).toBe(...)` chains are allowed in tests only. Database tests use in-process PGlite (no Docker).
