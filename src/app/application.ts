// application.ts
// A service: one config, one Database, one Kafka client, the Elysia app and the modules of the config.
//   const application = new Application(appConfig);     // config.ts of the app
//   await application.start();
// The constructor sets the config for the whole library (setAppConfig) and builds the parts from it.
// start():  Kafka log sink -> database (single / multi-tenant, tenant pools, listener) -> modules -> listen
// stop():   HTTP server -> database -> last Kafka log flush   (also on SIGINT / SIGTERM)
// Modules come from config.modules, in order; a module is skipped when isEnabled is false or its name is in
// config.disabledModules. Each one is created with new Module(database) and registered.

import { Elysia, type AnyElysia } from "elysia";
import { setAppConfig, type AppConfig } from "../config/app-config.ts";
import { Database } from "../db/database.ts";
import { KafkaClient } from "../kafka/kafka-client.ts";
import { KafkaLogSink } from "../kafka/kafka-log-sink.ts";
import { appLogger } from "../logging/app-logger.ts";
import { appPlugin } from "../plugins/app-plugin.ts";
import { readErrorText } from "../utils/text-util.ts";
import { isModuleEnabled, type IModule } from "./module-types.ts";

async function handleStopSignal(application: Application, signal: string): Promise<void> {
  appLogger.info("server: signal received", { signal });
  try {
    await application.stop();
  } catch (error) {
    const errorText = readErrorText(error);
    console.error(`server: stop failed: ${errorText}`);
  }
  process.exit(0);
}

export class Application {
  readonly config: AppConfig;

  readonly database: Database;

  readonly kafka: KafkaClient;

  readonly logSink: KafkaLogSink;

  readonly app: AnyElysia;

  private readonly modules: IModule[] = [];

  private isRegistered = false;

  private isStopping = false;

  constructor(config: AppConfig) {
    setAppConfig(config);
    this.config = config;
    this.database = new Database(config.db);
    this.kafka = new KafkaClient(config.kafka);
    this.logSink = new KafkaLogSink(config.kafka.log, this.kafka);
    const basePlugin = appPlugin();
    this.app = new Elysia().use(basePlugin);
  }

  /** Names of the registered modules. */
  get moduleNames(): string[] {
    const names: string[] = [];
    for (const definition of this.config.modules) {
      const isEnabled = isModuleEnabled(definition, this.config.disabledModules);
      if (isEnabled) {
        names.push(definition.name);
      }
    }
    return names;
  }

  /** Creates the enabled modules of the config and registers them on the app (once). */
  registerModules(): void {
    if (this.isRegistered) {
      return;
    }
    this.isRegistered = true;
    for (const definition of this.config.modules) {
      const isEnabled = isModuleEnabled(definition, this.config.disabledModules);
      if (!isEnabled) {
        appLogger.info("app: module disabled", { module: definition.name });
        continue;
      }
      const module = new definition.module(this.database);
      module.register(this.app);
      this.modules.push(module);
      appLogger.info("app: module registered", { module: definition.name });
    }
  }

  private async initDatabaseSafely(): Promise<void> {
    try {
      await this.database.init();
    } catch (error) {
      const errorText = readErrorText(error);
      appLogger.error("db: init failed, the next request that needs the database tries again", { error: errorText });
    }
  }

  /** Starts the service (see the file header). */
  async start(): Promise<void> {
    await this.logSink.start();
    await this.initDatabaseSafely();
    this.registerModules();
    const server = this.config.server;
    this.app.listen({ port: server.port, hostname: server.hostname });
    appLogger.info("server: started", { port: server.port, hostname: server.hostname, modules: this.moduleNames });
    if (server.isSignalHandled) {
      const onSigint = handleStopSignal.bind(null, this, "SIGINT");
      const onSigterm = handleStopSignal.bind(null, this, "SIGTERM");
      process.once("SIGINT", onSigint);
      process.once("SIGTERM", onSigterm);
    }
  }

  /** Stops the HTTP server, closes the database and sends the last Kafka logs. */
  async stop(): Promise<void> {
    if (this.isStopping) {
      return;
    }
    this.isStopping = true;
    appLogger.info("server: stopping");
    await this.app.stop();
    await this.database.close();
    appLogger.info("server: stopped");
    await this.logSink.stop();
    this.isStopping = false;
  }
}
