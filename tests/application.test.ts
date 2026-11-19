// application.test.ts — the OOP service shape: Repository(database) -> Service(repository) -> Controller(service)
// -> Module(database) implements IModule; Application registers the enabled modules of the config.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ResponseType } from "dff-util";
import { Elysia, t, type AnyElysia } from "elysia";
import { Application, Database, mergeAppConfig, readAppConfig, type IModule, type ModuleDefinition } from "../src/index.ts";
import { muteConsole, restoreConsole } from "./quiet-console.ts";
import { TEST_CONFIG, restoreTestConfig } from "./test-config.ts";

class GreetingRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  FindName(id: string): string {
    const source = this.database.isConfigured ? "db" : "memory";
    return `user-${id} (${source})`;
  }
}

class GreetingService {
  private readonly repository: GreetingRepository;

  constructor(repository: GreetingRepository) {
    this.repository = repository;
  }

  GreetService(id: string): string {
    const name = this.repository.FindName(id);
    return `Hello ${name}`;
  }
}

class GreetingController {
  private readonly service: GreetingService;

  constructor(service: GreetingService) {
    this.service = service;
  }

  async Greet(context: { params: { id: string } }): Promise<ResponseType> {
    const data = this.service.GreetService(context.params.id);
    return { data };
  }

  register(app: Elysia): void {
    const greet = this.Greet.bind(this);
    app.get("/greeting/:id", { params: t.Object({ id: t.String() }) }, greet);
  }
}

class GreetingModule implements IModule {
  private readonly controller: GreetingController;

  constructor(database: Database) {
    const repository = new GreetingRepository(database);
    const service = new GreetingService(repository);
    this.controller = new GreetingController(service);
  }

  register(app: AnyElysia): void {
    const routes = new Elysia({ name: "greeting-routes" });
    this.controller.register(routes);
    app.use(routes);
  }
}

class PingModule implements IModule {
  constructor(_database: Database) {}

  register(app: AnyElysia): void {
    app.get("/ping", readPong);
  }
}

class AuditModule implements IModule {
  constructor(_database: Database) {}

  register(app: AnyElysia): void {
    app.get("/audit", readPong);
  }
}

function readPong(): ResponseType {
  return { data: "pong" };
}

const MODULES: ModuleDefinition[] = [
  { name: "greeting", module: GreetingModule },
  { name: "ping", module: PingModule, isEnabled: false },
  { name: "audit", module: AuditModule },
];

const config = mergeAppConfig(TEST_CONFIG, { modules: MODULES, disabledModules: ["audit"] });

let application: Application;

function startApplication(): void {
  muteConsole();
  application = new Application(config);
  application.registerModules();
}

function stopApplication(): void {
  restoreConsole();
  restoreTestConfig();
}

async function call(path: string): Promise<{ status: number; body: Record<string, any> }> {
  const request = new Request(`http://localhost${path}`, { headers: { "request-id": "app-1" } });
  const response = await application.app.handle(request);
  const body = (await response.json()) as Record<string, any>;
  return { status: response.status, body };
}

function testConfigIsSet(): void {
  expect(readAppConfig()).toBe(config);
  expect(application.config).toBe(config);
  expect(application.database.isConfigured).toBe(false);
}

async function testModuleChain(): Promise<void> {
  const reply = await call("/greeting/7");
  expect(reply.status).toBe(200);
  expect(reply.body.data).toBe("Hello user-7 (memory)");
  expect(reply.body.meta.requestId).toBe("app-1");
}

async function testDisabledModules(): Promise<void> {
  expect(application.moduleNames).toEqual(["greeting"]);
  const ping = await call("/ping");
  expect(ping.status).toBe(404);
  const audit = await call("/audit");
  expect(audit.status).toBe(404);
}

function testRegisterOnce(): void {
  application.registerModules();
  expect(application.moduleNames).toEqual(["greeting"]);
}

describe("Application", () => {
  beforeAll(startApplication);
  afterAll(stopApplication);
  it("sets the config for the whole library", testConfigIsSet);
  it("module -> controller -> service -> repository answers a route (with appPlugin meta)", testModuleChain);
  it("skips modules with isEnabled false or listed in disabledModules", testDisabledModules);
  it("registers the modules only once", testRegisterOnce);
});
