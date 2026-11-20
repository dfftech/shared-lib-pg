# shared-bun-elysia example

An object oriented multi-tenant service built on `shared-bun-elysia`, the shape of every service: `config.ts` (which
uses `env()` to read `BASE_NAME`-prefixed settings) builds one `AppConfig` and lists the modules, `main.ts` runs
`new Application(appConfig).start()`, and each module builds
`Repository(database)` → `Service(repository)` → `Controller(service)` in its constructor. One database per tenant
(schemas of one PostgreSQL here), Kafka logs keyed by tenant; a user / address save writes its audit entry in the same
transaction. It imports the library source (`../src`) through `tsconfig.json` paths and uses the packages of the
library root, so install once at the root.

```
src/
├── config.ts                       appConfig: AppConfig from env() + MODULES (health, user, address, audit-log)
├── main.ts                         new Application(appConfig).start()
├── log-tail.ts                     prints the Kafka logs: [tenant] LEVEL message
└── modules/
    ├── health/                     HealthModule -> HealthController -> HealthService(database)
    │                               GET /health, GET /health/:id (tenant DB ping)
    ├── user/                       POST /user-save, POST /user-search, GET /user-entity/:id
    │   ├── user.module.ts          UserModule(database): repository -> service -> controller, register(app)
    │   ├── user.controller.ts      UserController(service): SaveUser, SearchUsers, EntityByIdUser, register(app)
    │   ├── user.service.ts         UserService(repository, auditLogService): validation, unique e-mail, transaction
    │   ├── user.repository.ts      UserRepository(database) extends DrizzleRepository: FindByEmail, Search
    │   ├── user.mapper.ts          static UserMapper: FromDto, ToEntity, ToView, ToViewList, ToViewPage
    │   ├── user.dto.ts             static UserDto: SaveSchema, SearchSchema, IdParamsSchema + UserView
    │   └── user.entity.ts          Drizzle table users
    ├── address/                    the same 7 files: /address-save, /address-search, /address-entity/:id
    └── audit-log/                  the same 7 files, read only: /audit-log-search, /audit-log-entity/:id
sql/0000-core.sql                   registry core.tenants (acme, globex) + core tables ("core" tenant)
sql/0001-tenant.sql                 tenant_acme / tenant_globex schemas: users, addresses, audit_logs
docs/rest/*.rest                    requests for the REST Client
```

`BASE_NAME=CORE` makes `env("DB_URL")` read `CORE_DB_URL`. Example services use the request helpers
`logger()`, `session_user()`, `request_id()`, `branch_id()`, and `tenant_id()` instead of reading request internals.

## Run

```bash
bun install                     # in the library root
cd example
docker compose up -d            # PostgreSQL 17 (runs sql/*.sql once) + Kafka (KRaft, localhost:9092)
cp .env.example .env
bun run dev                     # http://localhost:4000
bun run logs                    # second terminal: the Kafka logs, per tenant
```

```bash
curl -s localhost:4000/health
curl -s localhost:4000/health/acme
curl -s -X POST localhost:4000/address-save -H 'content-type: application/json' -H 'x-tenant-id: acme' \
  -d '{"address":"123 Main Street","city":"Toronto","type":"billing"}'
curl -s -X POST localhost:4000/address-search -H 'content-type: application/json' -H 'x-tenant-id: globex' -d '{}'
```

```bash
curl -s -X POST localhost:4000/user-save -H 'content-type: application/json' -H 'x-tenant-id: acme' \
  -d '{"name":"Ann Lee","email":"ann@example.com","persona":"admin"}'
curl -s -X POST localhost:4000/audit-log-search -H 'content-type: application/json' -H 'x-tenant-id: acme' \
  -d '{"entity":"address"}'      # CREATE / UPDATE entries: who, request id, branch, saved row
```

`acme` and `globex` see only their own rows; `x-tenant-id: core` uses the base database.
No `x-tenant-id` → `400 TENANT_REQUIRED`, unknown tenant → `404 TENANT_NOT_FOUND`.

## Multi-tenant things to try

- **Transaction:** drop `audit_logs` in one tenant schema and save an address there: the reply is a 500 with the
  PostgreSQL message and the address is not saved either (rolled back).
- **New tenant without a restart:** create a schema with `addresses` (see `sql/0001-tenant.sql`) and insert a row into
  `core.tenants`; the trigger + LISTEN opens its pool.
- **Topic per tenant:** `CORE_KAFKA_LOG_TOPIC=app-logs-{tenant}` → `app-logs-acme`, `app-logs-globex`;
  `bun run logs` then reads every `app-logs-*` topic.
- **Kafka down:** stop the kafka container; requests are not slower, logs wait in the queue and are sent when it is back.
- **Turn a module off:** `CORE_MODULES_DISABLED=audit-log` (or `isEnabled: false` in `config.ts`); its routes are gone,
  the others keep working.
- **Without Kafka / database:** `CORE_KAFKA_LOG_SEND=false` (console logs only); without `CORE_DB_URL` only
  `GET /health` works.
