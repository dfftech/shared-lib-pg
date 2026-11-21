# shared-lib-pg

## Install

```bash
bun add shared-lib-pg elysia@2.0.0-rc.3 typebox drizzle-orm pg kafkajs dff-util
```

## Configure a service

Create `src/config.ts` and export one `AppConfig`. Read environment variables and list the modules there. Use the
[example configuration](./example/src/config.ts) as a template for the required settings and parsers.

```ts
import { Application } from "shared-lib-pg";
import { appConfig } from "./config.ts";

const application = new Application(appConfig);
await application.start();
```

`Application.start()` initializes the configured database and logging services, registers enabled modules, then
starts the HTTP server. The example's [main entry point](./example/src/main.ts) shows the startup pattern.

## Add a module

Create a module directory under `src/modules/` with a module, controller, service, repository, DTO, mapper and entity.
Build dependencies in the module constructor: repository → service → controller. Add the module to the `modules`
array in `config.ts`. Use the [health module](./example/src/modules/health/health.module.ts) as a small example and
the [address module](./example/src/modules/address/address.module.ts) for database-backed routes.

Use the module's Elysia instance for its routes and plugins. For database-backed routes, install
`database.tenantPlugin()` on that instance. Keep database queries in repositories, business logic in services, and
DTO conversion in static mappers.

## Run the example

The [example service](./example/README.md) includes PostgreSQL and Kafka configuration, SQL migrations, and REST
requests.

```bash
bun install
bun run example:dev
```

## Development

```bash
bun install
bun run verify
```

See [CODING_RULES.md](./CODING_RULES.md) for contribution style rules and [.agent/skills/](./.agent/skills/) for
coding-agent skills.
