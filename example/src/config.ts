// config.ts
// The configuration of the example service. env() reads BASE_NAME-prefixed values; Application gives this config to
// the library and modules.
// In Docker / Kubernetes the values come from the container environment; in development Bun also loads example/.env.
// Modules are registered in this order. Add a module = one line in MODULES. Turn one off without code changes:
// isEnabled: false here, or CORE_MODULES_DISABLED=audit-log in the environment.

import {
  buildDefaultConfig,
  DEFAULT_MASK_KEYS,
  env,
  parseBoolean,
  parseKafkaSasl,
  parseList,
  parseLogLevel,
  parseNumber,
  parseText,
  setAppConfig,
  type AppConfig,
  type ModuleDefinition,
} from 'shared-lib-pg';
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

const BASE_NAME = parseText(process.env.BASE_NAME, 'CORE');
const bootstrapConfig = buildDefaultConfig();
bootstrapConfig.baseName = BASE_NAME;
setAppConfig(bootstrapConfig);

const environment = {
  baseName: env('BASE_NAME') || 'CORE',
  serviceName: env('SERVICE_NAME') || 'poc-shared-lib-pg',
  dbUrl:
    env('DB_URL') ||
    'postgresql://postgres:zyeoTHyJtYeXQpDJYtylRMIO@shared-lib-pg-raw-bank.sage.cloud.layerbase.dev:5432/shared_lib_pg?sslmode=require',
  dbPoolSize: env('DB_POOL_SIZE') || '5',
  dbIdleTimeoutMs: env('DB_IDLE_TIMEOUT_MS'),
  dbConnectTimeoutMs: env('DB_CONNECT_TIMEOUT_MS'),
  dbTenantEvents: env('DB_TENANT_EVENTS'),
  jwtSecret: env('API_JWT_SECRET'),
  jwtKey: env('API_JWT_KEY'),
  jwtExpiresIn: env('API_JWT_EXPIRES_IN'),
  jwtMaxExpiresIn: env('API_JWT_MAX_EXPIRES_IN'),
  logLevel: env('LOG_LEVEL'),
  logResponse: env('LOG_RESPONSE'),
  logMaskKeys: env('LOG_MASK_KEYS'),
  kafkaBrokers: env('KAFKA_BROKERS'),
  kafkaClientId: env('KAFKA_CLIENT_ID'),
  kafkaSsl: env('KAFKA_SSL'),
  kafkaUsername: env('KAFKA_USERNAME'),
  kafkaPassword: env('KAFKA_PASSWORD'),
  kafkaSaslMechanism: env('KAFKA_SASL_MECHANISM'),
  kafkaLogSend: env('KAFKA_LOG_SEND'),
  kafkaLogTopic: env('KAFKA_LOG_TOPIC'),
  kafkaLogFlushMs: env('KAFKA_LOG_FLUSH_MS'),
  kafkaLogBatchSize: env('KAFKA_LOG_BATCH_SIZE'),
  kafkaLogQueueMax: env('KAFKA_LOG_QUEUE_MAX'),
  apiBaseUrl: env('API_BASE_URL'),
  modulesDisabled: env('MODULES_DISABLED'),
};

const SERVICE_NAME = parseText(environment.serviceName, 'poc-shared-lib-pg');

export const appConfig: AppConfig = {
  baseName: BASE_NAME,
  serviceName: SERVICE_NAME,
  version: examplePackage.version,
  server: {
    port: parseNumber(process.env.PORT, 4000),
    hostname: '0.0.0.0',
    isSignalHandled: true,
  },
  db: {
    url: parseText(environment.dbUrl, ''),
    poolSize: parseNumber(environment.dbPoolSize, 10),
    idleTimeoutMs: parseNumber(environment.dbIdleTimeoutMs, 20_000),
    connectTimeoutMs: parseNumber(environment.dbConnectTimeoutMs, 60_000),
    isTenantEventsEnabled: parseBoolean(environment.dbTenantEvents, true),
  },
  jwt: {
    secret: parseText(environment.jwtSecret, ''),
    key: parseText(environment.jwtKey, 'API_JWT_KEY'),
    expiresIn: parseNumber(environment.jwtExpiresIn, 900),
    maxExpiresIn: parseNumber(environment.jwtMaxExpiresIn, 36_000),
  },
  log: {
    level: parseLogLevel(environment.logLevel, 'info'),
    isResponseLogged: parseBoolean(environment.logResponse, false),
    maskKeys: parseList(environment.logMaskKeys, DEFAULT_MASK_KEYS),
  },
  kafka: {
    brokers: parseList(environment.kafkaBrokers, ['localhost:9092']),
    clientId: parseText(environment.kafkaClientId, SERVICE_NAME),
    isSsl: parseBoolean(environment.kafkaSsl, false),
    sasl: parseKafkaSasl(environment.kafkaUsername, environment.kafkaPassword, environment.kafkaSaslMechanism),
    log: {
      isEnabled: parseBoolean(environment.kafkaLogSend, false),
      topic: parseText(environment.kafkaLogTopic, 'app-logs'),
      flushMs: parseNumber(environment.kafkaLogFlushMs, 500),
      batchSize: parseNumber(environment.kafkaLogBatchSize, 200),
      queueMax: parseNumber(environment.kafkaLogQueueMax, 10_000),
    },
  },
  http: {
    apiBaseUrl: parseText(environment.apiBaseUrl, ''),
  },
  modules: MODULES,
  disabledModules: parseList(environment.modulesDisabled, []),
};
