// config.ts
// The configuration of the example service, read directly from the environment (process.env). This is the ONLY
// place the service reads env: the library and the modules read this config (Application sets it).
// In Docker / Kubernetes the values come from the container environment; in development Bun also loads example/.env.
// Modules are registered in this order. Add a module = one line in MODULES. Turn one off without code changes:
// isEnabled: false here, or CORE_MODULES_DISABLED=audit-log in the environment.

import {
  DEFAULT_MASK_KEYS,
  parseBoolean,
  parseKafkaSasl,
  parseList,
  parseLogLevel,
  parseNumber,
  parseText,
  type AppConfig,
  type ModuleDefinition,
} from "shared-bun-elysia";
import examplePackage from "../package.json" with { type: "json" };
import { AddressModule } from "./modules/address/address.module.ts";
import { AuditLogModule } from "./modules/audit-log/audit-log.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { UserModule } from "./modules/user/user.module.ts";

export const MODULES: ModuleDefinition[] = [
  { name: "health", module: HealthModule },
  { name: "user", module: UserModule },
  { name: "address", module: AddressModule },
  { name: "audit-log", module: AuditLogModule },
];

const env = process.env;

const SERVICE_NAME = parseText(env.CORE_SERVICE_NAME, "example-service");

export const appConfig: AppConfig = {
  baseName: parseText(env.BASE_NAME, "CORE"),
  serviceName: SERVICE_NAME,
  version: examplePackage.version,
  server: {
    port: parseNumber(env.PORT, 4000),
    hostname: parseText(env.CORE_HOSTNAME, "0.0.0.0"),
    isSignalHandled: true,
  },
  db: {
    url: parseText(env.CORE_DB_URL, ""),
    poolSize: parseNumber(env.CORE_DB_POOL_SIZE, 10),
    idleTimeoutMs: parseNumber(env.CORE_DB_IDLE_TIMEOUT_MS, 20_000),
    connectTimeoutMs: parseNumber(env.CORE_DB_CONNECT_TIMEOUT_MS, 10_000),
    isTenantEventsEnabled: parseBoolean(env.CORE_DB_TENANT_EVENTS, true),
  },
  jwt: {
    secret: parseText(env.CORE_API_JWT_SECRET, ""),
    key: parseText(env.CORE_API_JWT_KEY, "API_JWT_KEY"),
    expiresIn: parseNumber(env.CORE_API_JWT_EXPIRES_IN, 900),
    maxExpiresIn: parseNumber(env.CORE_API_JWT_MAX_EXPIRES_IN, 36_000),
  },
  log: {
    level: parseLogLevel(env.CORE_LOG_LEVEL, "info"),
    isResponseLogged: parseBoolean(env.CORE_LOG_RESPONSE, false),
    maskKeys: parseList(env.CORE_LOG_MASK_KEYS, DEFAULT_MASK_KEYS),
  },
  kafka: {
    brokers: parseList(env.CORE_KAFKA_BROKERS, ["localhost:9092"]),
    clientId: parseText(env.CORE_KAFKA_CLIENT_ID, SERVICE_NAME),
    isSsl: parseBoolean(env.CORE_KAFKA_SSL, false),
    sasl: parseKafkaSasl(env.CORE_KAFKA_USERNAME, env.CORE_KAFKA_PASSWORD, env.CORE_KAFKA_SASL_MECHANISM),
    log: {
      isEnabled: parseBoolean(env.CORE_KAFKA_LOG_SEND, false),
      topic: parseText(env.CORE_KAFKA_LOG_TOPIC, "app-logs"),
      flushMs: parseNumber(env.CORE_KAFKA_LOG_FLUSH_MS, 500),
      batchSize: parseNumber(env.CORE_KAFKA_LOG_BATCH_SIZE, 200),
      queueMax: parseNumber(env.CORE_KAFKA_LOG_QUEUE_MAX, 10_000),
    },
  },
  http: {
    apiBaseUrl: parseText(env.CORE_API_BASE_URL, ""),
  },
  modules: MODULES,
  disabledModules: parseList(env.CORE_MODULES_DISABLED, []),
};
