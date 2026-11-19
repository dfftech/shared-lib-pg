---
name: elysia-module
description: >
  Object oriented module structure for Bun + Elysia 2.0 services on shared-bun-elysia: {module}.module.ts
  (implements IModule), .controller.ts, .service.ts, .repository.ts (extends DrizzleRepository), static
  .mapper.ts and .dto.ts, .entity.ts; constructor injection Repository(database) -> Service(repository) ->
  Controller(service) -> Module(database); save + search + entity-by-id routes; registered from config.ts.
---

# Elysia module — object oriented structure

Module and file names are **singular** (`user`, not `users`). Every module has these 7 files and the 3 routes save,
search and entity by id, and one line in `src/config.ts`. Only write inside `src/modules/` and `src/config.ts`.

```
src/modules/{module}/
├── {module}.module.ts       class {Module}Module implements IModule
├── {module}.controller.ts   class {Module}Controller(service)
├── {module}.service.ts      class {Module}Service(repository, other services)
├── {module}.repository.ts   class {Module}Repository(database) extends DrizzleRepository
├── {module}.mapper.ts       static class {Module}Mapper (pure)
├── {module}.dto.ts          static class {Module}Dto + types + {Module}View
└── {module}.entity.ts       Drizzle pgTable {module}Entity + type {Module}Entity
```

```ts
// src/config.ts — add the module (order = registration order)
export const MODULES: ModuleDefinition[] = [
  { name: "health", module: HealthModule },
  { name: "user", module: UserModule },
];
```

## {module}.module.ts

```ts
export class UserModule implements IModule {
  private readonly database: Database;

  private readonly controller: UserController;

  constructor(database: Database) {
    this.database = database;
    const repository = new UserRepository(database);
    const auditLogRepository = new AuditLogRepository(database);     // other modules: their service, built here
    const auditLogService = new AuditLogService(auditLogRepository);
    const service = new UserService(repository, auditLogService);
    this.controller = new UserController(service);
  }

  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "user-routes" });
    const tenantDb = this.database.tenantPlugin();                     // tenant database of the request
    routes.use(tenantDb);
    this.controller.register(routes);
    app.use(routes);
  }
}
```

- The constructor takes only the `Database` (Application calls `new UserModule(database)`).
- Plugins (tenant, auth: `authPlugin({ roles })`) go on the module's own instance, never on `app`.

## {module}.controller.ts

```ts
export class UserController {
  private readonly service: UserService;

  constructor(service: UserService) {
    this.service = service;
  }

  /** POST /user-save */
  async SaveUser(context: { body: UserSaveDto }): Promise<ResponseType> {
    const data = await this.service.SaveService(context.body);
    return { data, status: SAVED_SUCCESSFULLY };
  }

  /** POST /user-search */
  async SearchUsers(context: { body: UserSearchDto }): Promise<ResponseType> {
    const page = await this.service.SearchService(context.body);
    return { ...page, status: LISTED_SUCCESSFULLY };
  }

  /** GET /user-entity/:id */
  async EntityByIdUser(context: { params: UserIdParams }): Promise<ResponseType> {
    const data = await this.service.EntityByIdService(context.params.id);
    return { data };
  }

  register(app: Elysia): void {
    const saveUser = this.SaveUser.bind(this);
    const searchUsers = this.SearchUsers.bind(this);
    const entityByIdUser = this.EntityByIdUser.bind(this);
    app.post("/user-save", { body: UserDto.SaveSchema }, saveUser);
    app.post("/user-search", { body: UserDto.SearchSchema }, searchUsers);
    app.get("/user-entity/:id", { params: UserDto.IdParamsSchema }, entityByIdUser);
  }
}
```

- Paths kebab-case `/{module}-{action}`, `/{module}-entity/:id`. Elysia 2.0 order: `(path, hook, handler)`.
- Handlers PascalCase, thin, NO try / catch; `ResponseType` only here; bind handlers in `register`.
- `register(app: Elysia)` (plain `Elysia`, so handler context types stay precise).

## {module}.service.ts

```ts
export class UserService {
  private readonly repository: UserRepository;

  private readonly auditLogService: AuditLogService;

  constructor(repository: UserRepository, auditLogService: AuditLogService) { ... }

  async EntityByIdService(id: string): Promise<UserView | null> { ... }        // repository.FindById -> UserMapper.ToView
  SaveValidation(dto: UserSaveDto): string | null { ... }                      // error code or null
  async SaveService(dto: UserSaveDto): Promise<UserView> {
    const invalidCode = this.SaveValidation(dto);
    if (invalidCode !== null) {
      throw new AppError(invalidCode);
    }
    const values = UserMapper.FromDto(dto);
    const transaction = await this.repository.Begin();
    try {
      const view = await this.SaveInTransaction(values, transaction);         // FindById, ToEntity, Create / UpdateById, ToView, audit
      await transaction.commit();
      return view;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  async SearchService(input: UserSearchDto): Promise<SearchPage<UserView>> { ... }   // UserMapper.ToViewPage(await repository.Search(input))
}
```

- Methods PascalCase, public ones with the `Service` postfix. No Drizzle, no field-by-field conversion.
- Reads the request context (`readSessionUser()`, `readLogger()`) and passes values to the mapper.
- Returns views (never entities); `throw new AppError(code)` for expected failures.

## {module}.repository.ts

```ts
export class UserRepository extends DrizzleRepository<typeof userEntity> {
  constructor(database: Database) {
    super(database, userEntity);       // FindById, Create, UpdateById, DeleteById, SearchRows, Begin, Db, Entity
  }

  async FindByEmail(email: string, transaction?: ITransaction): Promise<UserEntity | undefined> {
    const db = this.Db(transaction);
    const emailMatch = eq(userEntity.email, email);
    const rows = await db.select().from(userEntity).where(emailMatch).limit(1);
    return rows[0];
  }

  BuildSearchWhere(input: UserSearchDto): SQL | undefined { ... }   // buildSearchWhere(userEntity, input, termKeys, fieldConds)

  async Search(input: UserSearchDto, transaction?: ITransaction): Promise<SearchPage<UserEntity>> {
    const where = this.BuildSearchWhere(input);
    return this.SearchRows(input, where, transaction);
  }
}
```

- `transaction?: ITransaction` is ALWAYS the last argument; queries run on `this.Db(transaction)`.
- Returns entities. One condition per const before `.where(...)`.

## {module}.mapper.ts (static, pure)

```ts
export type UserValues = Omit<UserEntity, keyof AuditColumns>;

export class UserMapper {
  static FromDto(dto: UserSaveDto): UserValues { ... }                   // readText / readOptionalText, new id when none
  static ToEntity(values: UserValues, existing: UserEntity | undefined, userId: string): UserEntity {
    const auditColumns = buildAuditColumns(existing, userId);
    return { ...values, ...auditColumns };
  }
  static ToView(entity: UserEntity): UserView { ... }                    // field by field, snake_case -> camelCase, ISO dates
  static ToViewList(entities: UserEntity[]): UserView[] { ... }
  static ToViewPage(page: SearchPage<UserEntity>): SearchPage<UserView> { ... }
}
```

## {module}.dto.ts (static)

```ts
export class UserDto {
  static readonly SaveSchema = t.Object({ id: t.Optional(t.String()), name: t.String(), email: t.String() });
  static readonly SearchSchema = t.Object({ ...searchFields, email: t.Optional(t.String()) });
  static readonly IdParamsSchema = idParamsSchema;
}

export type UserSaveDto = Static<typeof UserDto.SaveSchema>;
export type UserSearchDto = Static<typeof UserDto.SearchSchema>;
export type UserIdParams = Static<typeof UserDto.IdParamsSchema>;
export type UserView = { id: string; name: string; email: string; createdAt: string; ... };
```

## {module}.entity.ts

```ts
export const userEntity = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name").notNull(),
  created_by: varchar("created_by", { length: 255 }).notNull().default("System"),
  updated_by: varchar("updated_by", { length: 255 }).notNull().default("System"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type UserEntity = typeof userEntity.$inferSelect;
```

Entities never alter the database (no drizzle-kit push / migrate): write SQL migrations for every tenant database.
