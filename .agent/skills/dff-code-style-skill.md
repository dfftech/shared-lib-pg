---
name: dff-code-style
description: >
  Readability rules for every DesignForFeature TypeScript backend file (Bun + Elysia):
  no nested functions, no calls or inline objects passed into another call, no chained calls
  (except Elysia / Drizzle builder chains), avoid callback hell, for...of loops, named exports.
  Run scripts/check-code-style.mjs for the automated source checks; use this skill for the full guidance.
---

# DFF code style — easy for people and AI to read

Run `bun run check:style` after every change. It must print `Code style OK`.

## Rule 1 — NO_NESTED_FUNCTION

Every function is declared at the top level of the file (class methods count as top level). No arrow functions inside
functions, handlers or service methods.

| Instead of | Write |
| --- | --- |
| `app.post("/x-save", async ({ body }) => ...)` | controller method `async SaveX(context: { body: XSaveDto })` + in `register`: bind the method, assign route options to a `const`, then call `app.post(path, options, handler)` |
| `pool.on("error", (error) => log(label, error))` | top-level `handlePoolError(label, error)`, bind it to a `const`, then pass that variable to `pool.on` |
| `db.transaction(async (tx) => ...)` | `const transaction = await this.repository.Begin()` + try / `commit()` / catch `rollback()` |
| `rows.map((row) => toView(row))` | `toViewMapper(rows)`, or `for (const row of rows) { ... push }` |
| `new Promise((resolve) => setTimeout(resolve, 300))` | `await Bun.sleep(300)` |
| `.catch((error) => ...)` | `promise.catch(handleLoadError)` |

## Rule 2 — NO_CALL_OR_INLINE_OBJECT

```ts
// WRONG
abcd(xyz());
saveUser(await loadUser(id));
const service = new UserService(new UserRepository(database));
register({ path: "/users" });
saveUser({ id: createId(), name });

// RIGHT
const value = xyz();
abcd(value);
const user = await loadUser(id);
saveUser(user);
const repository = new UserRepository(database);
const service = new UserService(repository);
const options = { path: "/users" };
register(options);
const id = createId();
const userValues = { id, name };
saveUser(userValues);
```

Do not pass a function call, `new` expression, or inline object literal directly as an argument. Assign it to a
named `const` first and pass that variable; do not put calls inside argument object literals either.
Exception: schema builders nest, `t.Optional(t.String())`. Drizzle conditions go in consts:
`const idMatch = eq(userEntity.id, id); ... .where(idMatch)`.

## Rule 3 — NO_CHAINED_CALL

```ts
// WRONG
const code = readCode().toLowerCase();
// RIGHT
const rawCode = readCode();
const code = rawCode.toLowerCase();
```

Exception: builder chains of Elysia (`new Elysia().use(x).post(...)`) and Drizzle
(`db.select().from(t).where(w).limit(1)`, `text("id").primaryKey()`): see `BUILDER_METHODS` in the checker.

## Rule 4 — NO_CALLBACK_HELL

Do not nest callbacks or create deeply nested `.then()` / `.catch()` chains. Extract callbacks into named
top-level functions or class methods; prefer `async` / `await` and intermediate variables.

## Rule 5 — FILE_NAMING

File and folder names: lowercase words joined with `-`, `.` for a role suffix.
`app-plugin.ts`, `request-context.ts`, `user.api.ts`, `user.service.ts`, `kafka-log-queue.test.ts`, `0000-core.sql`.
Never `AppPlugin.ts`, `requestContext.ts`, `user_service.ts`. Exported classes and handlers stay PascalCase inside the file.

## Also

- Named exports only (`export function X`, `export class X`); no default exports except tool config files.
- File header comment explaining the file; `/** ... */` on every exported function.
- Clear names: `tenantId`, `isNew`, `userRows`; booleans start with `is` / `has` / `can` / `show`.
- Env only in the app's `config.ts` (`process.env` read directly into the `AppConfig` object); everything else reads the config. Request values come from the
  request context (`readTenantId()`, `readSessionUser()` ...), never fields or module variables.
- Tests: `bun test` with `describe` / `it` / `expect` from `bun:test`; named top-level test functions, `it("does x", testDoesX)`; `expect(...).toBe(...)` chains are allowed in tests only.
