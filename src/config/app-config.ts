// app-config.ts
// The one configuration of a service. Every library class reads its settings from here, never from env.
// The app writes it in its config.ts, reading process.env directly (the only place env is read), and gives it to
// new Application(appConfig), which sets it for the whole library (setAppConfig).
//   export const appConfig: AppConfig = {
//     db: { url: process.env.CORE_DB_URL ?? "", poolSize: parseNumber(process.env.CORE_DB_POOL_SIZE, 10), ... },
//     modules: MODULES,
//     ...
//   };

import type { ModuleDefinition } from "../app/module-types.ts";
import type { LogLevel } from "../logging/log-types.ts";

export type ServerConfig = {
  port: number;
  hostname: string;
  /** Stop cleanly on SIGINT / SIGTERM. */
  isSignalHandled: boolean;
};

export type DbConfig = {
  /** Base database URL; the schema comes from ?options=-c%20search_path%3D<schema>. "" = no database. */
  url: string;
  poolSize: number;
  idleTimeoutMs: number;
  connectTimeoutMs: number;
  /** Trigger + LISTEN on the tenants table. */
  isTenantEventsEnabled: boolean;
};

export type JwtConfig = {
  /** Signing secret; "" = not configured (signing and verifying throw). */
  secret: string;
  key: string;
  /** Token lifetime in seconds. */
  expiresIn: number;
  /** Max session age in seconds (regenerate stops after it). */
  maxExpiresIn: number;
};

export type LogConfig = {
  level: LogLevel;
  /** Add the (masked) reply to "Request completed". */
  isResponseLogged: boolean;
  /** Log keys whose values are masked. */
  maskKeys: string[];
};

export type KafkaSaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512";

export type KafkaSaslConfig = {
  mechanism: KafkaSaslMechanism;
  username: string;
  password: string;
};

export type KafkaLogConfig = {
  isEnabled: boolean;
  /** "app-logs" = one topic (key = tenant id); "app-logs-{tenant}" = one topic per tenant. */
  topic: string;
  flushMs: number;
  batchSize: number;
  queueMax: number;
};

export type KafkaConfig = {
  brokers: string[];
  clientId: string;
  isSsl: boolean;
  sasl: KafkaSaslConfig | undefined;
  log: KafkaLogConfig;
};

export type HttpConfig = {
  /** Start of relative AppHttp URLs. */
  apiBaseUrl: string;
};

export type AppConfig = {
  baseName: string;
  serviceName: string;
  /** Version of the service (health replies, logs). */
  version: string;
  server: ServerConfig;
  db: DbConfig;
  jwt: JwtConfig;
  log: LogConfig;
  kafka: KafkaConfig;
  http: HttpConfig;
  /** Modules of the service, registered in this order (Application). */
  modules: ModuleDefinition[];
  /** Names of modules that are not registered (for example from env CORE_MODULES_DISABLED). */
  disabledModules: string[];
};

/** Partial config: every section may give only the values it changes. */
export type AppConfigOverrides = {
  baseName?: string;
  serviceName?: string;
  version?: string;
  server?: Partial<ServerConfig>;
  db?: Partial<DbConfig>;
  jwt?: Partial<JwtConfig>;
  log?: Partial<LogConfig>;
  kafka?: Partial<Omit<KafkaConfig, "log">> & { log?: Partial<KafkaLogConfig> };
  http?: Partial<HttpConfig>;
  modules?: ModuleDefinition[];
  disabledModules?: string[];
};

export const DEFAULT_MASK_KEYS = ["email", "mobile", "tel_code", "telcode", "phone", "password", "token", "authorization", "pic", "secret"];

export const DEFAULT_LOG_TOPIC = "app-logs";

export const DEFAULT_PORT = 4000;

let currentConfig: AppConfig | null = null;

/** Config with the library defaults (no database, Kafka logs off, no JWT secret). */
export function buildDefaultConfig(): AppConfig {
  return {
    baseName: "",
    serviceName: "app",
    version: "0.0.0",
    server: { port: DEFAULT_PORT, hostname: "0.0.0.0", isSignalHandled: true },
    db: { url: "", poolSize: 10, idleTimeoutMs: 20_000, connectTimeoutMs: 10_000, isTenantEventsEnabled: true },
    jwt: { secret: "", key: "API_JWT_KEY", expiresIn: 900, maxExpiresIn: 36_000 },
    log: { level: "info", isResponseLogged: false, maskKeys: DEFAULT_MASK_KEYS },
    kafka: {
      brokers: ["localhost:9092"],
      clientId: "app",
      isSsl: false,
      sasl: undefined,
      log: { isEnabled: false, topic: DEFAULT_LOG_TOPIC, flushMs: 500, batchSize: 200, queueMax: 10_000 },
    },
    http: { apiBaseUrl: "" },
    modules: [],
    disabledModules: [],
  };
}

/** New config: base with the overrides of each section on top. */
export function mergeAppConfig(base: AppConfig, overrides: AppConfigOverrides): AppConfig {
  const kafkaLog: KafkaLogConfig = { ...base.kafka.log, ...overrides.kafka?.log };
  const kafka: KafkaConfig = { ...base.kafka, ...overrides.kafka, log: kafkaLog };
  return {
    baseName: overrides.baseName ?? base.baseName,
    serviceName: overrides.serviceName ?? base.serviceName,
    version: overrides.version ?? base.version,
    server: { ...base.server, ...overrides.server },
    db: { ...base.db, ...overrides.db },
    jwt: { ...base.jwt, ...overrides.jwt },
    log: { ...base.log, ...overrides.log },
    kafka,
    http: { ...base.http, ...overrides.http },
    modules: overrides.modules ?? base.modules,
    disabledModules: overrides.disabledModules ?? base.disabledModules,
  };
}

/** Sets the config every library class reads (Application does it). */
export function setAppConfig(config: AppConfig): void {
  currentConfig = config;
}

/** The config set by setAppConfig, else the defaults. */
export function readAppConfig(): AppConfig {
  if (currentConfig === null) {
    currentConfig = buildDefaultConfig();
  }
  return currentConfig;
}
