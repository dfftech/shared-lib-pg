# shared-bun-elysia

Bun + Elysia 2.0 backend library for DesignForFeature services, object oriented: an `Application` builds the
service from **one config** and registers **modules** (`Repository(database)` → `Service(repository)` →
`Controller(service)` → `Module(database)`). Multi-tenant PostgreSQL with Drizzle ORM, multi-tenant Kafka logs, JWT,
`AppError` + `ResponseType` replies, search helpers and `AppHttp`. Built on `dff-util`. MIT license.

| Encore core stack | shared-bun-elysia |
| --- | --- |
| `env()` everywhere | one `AppConfig` object in the app's `config.ts`, read directly from `process.env` (the only env read) |
| `encore.service.ts` per module | `{module}.module.ts`: `class XModule implements IModule`, listed in `config.modules` |
| `api<Dto, ResponseType>(...)` | `{module}.controller.ts`: class with handlers + `register(app)` |
| static `XService` + `session_db()` | `XService(repository)` → `XRepository(database)` extends `DrizzleRepository` |
| `FromDto` / `toViewMapper` in the service | static `{module}.mapper.ts` + typed views; static `{module}.dto.ts` schemas |
| `LoggingMiddleware` | `appPlugin()` (added by `Application`) |
| `TenantMiddleware` | `database.tenantPlugin()` inside each module |
| `init_tenants_db()`, `get_core_db()`, `get_tenant_db(id)` | `database.init()`, `database.core()`, `database.tenant(id)` |
| `createKafkaLogger(...)` | `KafkaLogSink` (batched, topic / key per tenant), started by `Application` |
| `TransactionManager.begin()` | `repository.Begin()` / `database.begin()` → `ITransaction` |

## Install

```bash
bun add shared-bun-elysia elysia@2.0.0-rc.3 typebox drizzle-orm pg kafkajs dff-util
```

Elysia 2.0 is a release candidate (`latest` on npm is still 1.4). On Bun the package runs from its TypeScript
source (`"bun"` export condition); other runtimes use `dist/`.

## Service

```ts
// src/config.ts — the ONLY place the service reads env: one AppConfig, straight from process.env
export const MODULES: ModuleDefinition[] = [
  { name: "health", module: HealthModule },
  { name: "user", module: UserModule },
  { name: "address", module: AddressModule, isEnabled: true },
];

const env = process.env;

export const appConfig: AppConfig = {
  serviceName: parseText(env.CORE_SERVICE_NAME, "user-service"),
  db: {
    url: parseText(env.CORE_DB_URL, ""),
    poolSize: parseNumber(env.CORE_DB_POOL_SIZE, 10),
    // ...
  },
  kafka: { log: { isEnabled: parseBoolean(env.CORE_KAFKA_LOG_SEND, false), /* ... */ }, /* ... */ },
  modules: MODULES,
  disabledModules: parseList(env.CORE_MODULES_DISABLED, []),
  // ... every section of AppConfig (TypeScript requires all of them; see example/src/config.ts)
};

// src/main.ts
const application = new Application(appConfig);
await application.start();
```

`new Application(config)` sets the config for the whole library and builds `database`, `kafka` and `logSink` from it.
`start()`: Kafka log sink → database (single / multi-tenant, tenant pools, tenants listener) → modules → listen.
`stop()` (also on SIGINT / SIGTERM): HTTP server → database → last Kafka log flush.

Modules are registered in the order of `config.modules`. A module is skipped when `isEnabled: false` or its name is in
`config.disabledModules` (e.g. env `CORE_MODULES_DISABLED=audit-log,address`). Adding a module is one line in `config.ts`.

## Module

```
modules/user/
├── user.module.ts       class UserModule implements IModule: builds the chain, register(app)
├── user.controller.ts   class UserController(service): handlers + register(app)
├── user.service.ts      class UserService(repository, ...): rules, transactions
├── user.repository.ts   class UserRepository(database) extends DrizzleRepository: the only Drizzle code
├── user.mapper.ts       static class UserMapper: FromDto, ToEntity, ToView, ToViewList, ToViewPage
├── user.dto.ts          static class UserDto: SaveSchema, SearchSchema, IdParamsSchema + types + UserView
└── user.entity.ts       Drizzle table
```

```ts
export class UserRepository extends DrizzleRepository<typeof userEntity> {
  constructor(database: Database) {
    super(database, userEntity);                     // FindById, Create, UpdateById, DeleteById, SearchRows, Begin
  }

  async FindByEmail(email: string, transaction?: ITransaction): Promise<UserEntity | undefined> {
    const db = this.Db(transaction);                 // the transaction, else the tenant database of the request
    const emailMatch = eq(userEntity.email, email);
    const rows = await db.select().from(userEntity).where(emailMatch).limit(1);
    return rows[0];
  }
}

export class UserService {
  private readonly repository: UserRepository;

  constructor(repository: UserRepository) {
    this.repository = repository;
  }

  async SaveService(dto: UserSaveDto): Promise<UserView> {
    const values = UserMapper.FromDto(dto);
    const sessionUser = readSessionUser();
    const entity = UserMapper.ToEntity(values, undefined, sessionUser.id);
    const transaction = await this.repository.Begin();
    try {
      const saved = await this.repository.Create(entity, transaction);
      await transaction.commit();
      return UserMapper.ToView(saved);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export class UserController {
  private readonly service: UserService;

  constructor(service: UserService) {
    this.service = service;
  }

  async SaveUser(context: { body: UserSaveDto }): Promise<ResponseType> {
    const data = await this.service.SaveService(context.body);
    return { data, status: SAVED_SUCCESSFULLY };
  }

  register(app: Elysia): void {
    const saveUser = this.SaveUser.bind(this);
    app.post("/user-save", { body: UserDto.SaveSchema }, saveUser);
  }
}

export class UserModule implements IModule {
  private readonly database: Database;

  private readonly controller: UserController;

  constructor(database: Database) {
    this.database = database;
    const repository = new UserRepository(database);
    const service = new UserService(repository);
    this.controller = new UserController(service);
  }

  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "user-routes" });   // the module's own instance: its plugins stay inside it
    const tenantDb = this.database.tenantPlugin();
    routes.use(tenantDb);
    this.controller.register(routes);
    app.use(routes);
  }
}
```

Elysia 2.0 notes: routes are `(path, hook, handler)` (schema before the handler); `'scoped'` is now `'plugin'`;
schema types are `Static<typeof UserDto.SaveSchema>` (`Static` is re-exported from `typebox`); controller handlers are
bound once in `register` (`this.SaveUser.bind(this)`).

## Config

The app's `config.ts` builds one `AppConfig` object and reads `process.env` there directly; no other code reads env.
In Docker / Kubernetes the values come from the container environment (in development Bun also loads `.env`).
The library only gives typed parsers for the env text (they never read env themselves; unset or empty → fallback):
`parseText`, `parseNumber`, `parseBoolean`, `parseList`, `parseLogLevel`, `parseKafkaSasl(user, password, mechanism)`.
`buildDefaultConfig()` / `mergeAppConfig(base, overrides)` build configs in code (tests); `Application` calls
`setAppConfig`, the library reads `readAppConfig()`.

| Config | Env in the example `config.ts` | Default there |
| --- | --- | --- |
| `serviceName`, `version` | `CORE_SERVICE_NAME`, (`package.json`) | `example-service` |
| `server.port`, `server.hostname` | `PORT`, `CORE_HOSTNAME` | 4000, `0.0.0.0` |
| `db.url` | `CORE_DB_URL` | — (no database) |
| `db.poolSize`, `db.idleTimeoutMs`, `db.connectTimeoutMs` | `CORE_DB_POOL_SIZE`, `CORE_DB_IDLE_TIMEOUT_MS`, `CORE_DB_CONNECT_TIMEOUT_MS` | 10, 20000, 10000 |
| `db.isTenantEventsEnabled` | `CORE_DB_TENANT_EVENTS` | true |
| `jwt.secret`, `jwt.key` | `CORE_API_JWT_SECRET`, `CORE_API_JWT_KEY` | — (no default secret), `API_JWT_KEY` |
| `jwt.expiresIn`, `jwt.maxExpiresIn` | `CORE_API_JWT_EXPIRES_IN`, `CORE_API_JWT_MAX_EXPIRES_IN` | 900, 36000 (seconds) |
| `log.level`, `log.isResponseLogged`, `log.maskKeys` | `CORE_LOG_LEVEL`, `CORE_LOG_RESPONSE`, `CORE_LOG_MASK_KEYS` | info, false, `email,mobile,...` |
| `kafka.brokers`, `kafka.clientId`, `kafka.isSsl` | `CORE_KAFKA_BROKERS`, `CORE_KAFKA_CLIENT_ID`, `CORE_KAFKA_SSL` | `localhost:9092`, service name, false |
| `kafka.sasl` | `CORE_KAFKA_USERNAME`, `CORE_KAFKA_PASSWORD`, `CORE_KAFKA_SASL_MECHANISM` | off without a username; plain |
| `kafka.log.isEnabled`, `kafka.log.topic` | `CORE_KAFKA_LOG_SEND`, `CORE_KAFKA_LOG_TOPIC` | false, `app-logs` |
| `kafka.log.flushMs`, `batchSize`, `queueMax` | `CORE_KAFKA_LOG_FLUSH_MS`, `CORE_KAFKA_LOG_BATCH_SIZE`, `CORE_KAFKA_LOG_QUEUE_MAX` | 500, 200, 10000 |
| `http.apiBaseUrl` | `CORE_API_BASE_URL` | — |
| `disabledModules` | `CORE_MODULES_DISABLED` | — |
| `modules` | (config.ts only) | — |

The env names are chosen in `config.ts`; the example keeps the `CORE_` names of the Encore core stack.

## Request context — `appPlugin()`

Added first by `Application`. For every request it runs the request in AsyncLocalStorage, reads `request-id` (or a
new UUID), `x-tenant-id`, `x-branch-id`, the trace id and the bearer token (decoded for logs and audit fields), logs
`Request started` / `Request completed`, adds `meta: { requestId, timestamp, duration }` to object replies and turns
errors into replies, so handlers need no try / catch:

| Thrown | Reply |
| --- | --- |
| `new AppError("INVALID_ADDRESS")` | `200 { data: null, error: "INVALID_ADDRESS" }` (Encore reply) |
| `new AppError(code, 401)` | `401 { data: null, error: code }` |
| schema validation | `422 { data: null, error: "INVALID_DATA", message, details: [{ path, message }] }` |
| bad JSON body / unknown route | `400 INVALID_DATA` / `404 NOT_FOUND` |
| anything else | `500 { data: null, error: "unknown", message }`, logged with stack, cause, pg code / detail |

For a failed query the reply `message` is the PostgreSQL message, never Drizzle's `Failed query: <sql> params: <values>`.

Readers anywhere in a request: `readRequestId()`, `readTenantId()`, `readBranchId()`, `readToken()`,
`readSessionUser()`, `readLogger()`, `readRequestContext()`.

## Database — `Database`

The tenant registry is `{schema}.tenants` (`id, name, db, active, ...`) in the base database (`db.url`, schema from
`?options=-c%20search_path%3Dcore`); `db` is each tenant's connection URL. With the table the service is
multi-tenant (one pool per active tenant, `x-tenant-id` picks the database, `"core"` = base database, a trigger +
`LISTEN tenant_change` resyncs pools without a restart); without it every request uses the base database.

| `Database` member | Use |
| --- | --- |
| `init()`, `close()` | started / stopped by `Application` (init runs once, tried again after a failure) |
| `tenantPlugin(options?)` | Elysia plugin of a module: tenant database of the request; 400 `TENANT_REQUIRED`, 404 `TENANT_NOT_FOUND` |
| `session()`, `executor(transaction?)` | database of the request / the transaction when given |
| `begin()` | `ITransaction { db, commit(), rollback() }` on the request database |
| `core()`, `tenant(id)`, `forTenant(id?)` | base database, one tenant, the database for a request |
| `runWithTenant(id, task, ...args)` | background work (consumer, job) with a tenant context |
| `isConfigured`, `isMultiTenant`, `tenantIds()`, `refreshTenantPools()`, `tenantEntity()` | state and registry |

`DrizzleRepository<TTable>` (base of every repository): `Db(transaction?)`, `Begin()`, `FindById`, `Create`,
`UpdateById`, `DeleteById`, `SearchRows(input, where?, transaction?)`, `Entity()`. Search helpers:
`buildSearchWhere(table, input, termKeys, extraConds)`, `toWhereCond(QueryCond(text), table)`, `buildOrderBy`,
`readPaging`, `searchFields` / `searchSchema` / `idParamsSchema`. `buildAuditColumns(existing, userId)` for mappers.

## Logs — console + multi-tenant Kafka

Every entry is masked (`log.maskKeys`), written to the console as one JSON line and, with `kafka.log.isEnabled`,
queued in `KafkaLogSink`. A request never waits for Kafka: batches go out every `flushMs` or when full. When Kafka is
down the service still starts, entries wait in a bounded queue and every flush tries to connect again.

| Multi-tenant | How |
| --- | --- |
| Message key | `tenant_id`: logs of one tenant stay in order on one partition |
| Topic | `app-logs` (one topic) or `app-logs-{tenant}` (one topic per tenant, `app-logs-core` without a tenant) |
| Entry | `{ level, message, timestamp, service, request_id, trace_id, session_user_id, tenant_id, branch_id, ...data }` |

`application.kafka` (`KafkaClient`): `publish(topic, key, message)`, `sendBatch`, `startConsumer({ topic, groupId, onMessage })`.

## JWT and HTTP

`JwtService` (dff-util JWT, the same tokens as the Encore services; settings from `config.jwt`, no default secret):
`GenerateToken`, `VerifyToken`, `DecodeToken`, `TryDecodeToken`, `RegenerateToken`. `authPlugin({ roles })` on a
module's routes: 401 `UNAUTHORIZED` / 403 `FORBIDDEN`. `AppHttp.Get / Post / Put / Delete` call other services with
the request token, request id, tenant and branch (relative URLs start at `config.http.apiBaseUrl`).

## Example

`example/` is a multi-tenant service with the modules health, user, address and audit-log (user / address save +
audit entry in one transaction), Docker Compose for PostgreSQL + Kafka, SQL and REST files. See
[example/README.md](./example/README.md).

## Development

```bash
bun install
bun run verify      # typecheck (library + example) + code style + tests + build
```

Tests run on `bun test` with the test config (no env); the database tests start in-process PGlite servers, so no
Docker is needed. Code rules: [CODING_RULES.md](./CODING_RULES.md). Agent skills: `.agent/skills/`.

## License

[MIT](./LICENSE)
