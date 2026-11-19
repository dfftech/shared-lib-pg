// shared-bun-elysia
// Shared Bun + Elysia 2.0 backend library, object oriented: Application + modules (repository -> service ->
// controller), one config (the app's config.ts reads process.env), multi-tenant PostgreSQL with Drizzle (Database),
// multi-tenant Kafka logs (KafkaLogSink), JWT, AppError + ResponseType replies, search helpers, AppHttp.
//
//   // config.ts:  export const appConfig: AppConfig = { db: { url: process.env.CORE_DB_URL ?? "", ... }, modules };
//   // main.ts:    const application = new Application(appConfig); await application.start();
//   // module:     class UserModule implements IModule { constructor(database: Database) {...} register(app) {...} }

// ---- Application and modules ----
export { Application } from "./app/application.ts";
export { isModuleEnabled, type IModule, type ModuleClass, type ModuleDefinition } from "./app/module-types.ts";

// ---- Config (the app's config.ts reads process.env directly; parse* turn the text into typed values) ----
export {
  DEFAULT_LOG_TOPIC,
  DEFAULT_MASK_KEYS,
  DEFAULT_PORT,
  buildDefaultConfig,
  mergeAppConfig,
  readAppConfig,
  setAppConfig,
  type AppConfig,
  type AppConfigOverrides,
  type DbConfig,
  type HttpConfig,
  type JwtConfig,
  type KafkaConfig,
  type KafkaLogConfig,
  type KafkaSaslConfig,
  type KafkaSaslMechanism,
  type LogConfig,
  type ServerConfig,
} from "./config/app-config.ts";
export {
  parseBoolean,
  parseKafkaSasl,
  parseList,
  parseLogLevel,
  parseNumber,
  parseText,
} from "./config/config-parse.ts";

// ---- Plugins ----
export { appPlugin, APP_PLUGIN_NAME, buildResponseMeta, createRequestContext, isPlainRecord, type AppPluginOptions, type RequestContextProps } from "./plugins/app-plugin.ts";
export { createTenantPlugin, type TenantPluginOptions, type TenantProps } from "./plugins/tenant-plugin.ts";
export { authPlugin, hasAnyRole, type AuthPluginOptions, type AuthProps } from "./plugins/auth-plugin.ts";
export {
  UNKNOWN_ERROR,
  readErrorLogData,
  readReplyMessage,
  readValidationDetails,
  toErrorReply,
  type ErrorKind,
  type ErrorReply,
  type ErrorReplyBody,
} from "./plugins/error-response.ts";

// ---- Request context ----
export {
  RequestContext,
  UNKNOWN_USER_ID,
  buildUnknownSessionUser,
  readBranchId,
  readLogger,
  readRequestContext,
  readRequestId,
  readSessionDb,
  readSessionUser,
  readTenantId,
  readToken,
  requestStorage,
  requireRequestContext,
  runWithContext,
  type RequestContextFields,
} from "./context/request-context.ts";
export { createTenantContext, runWithTenant, type TenantTaskOptions } from "./context/tenant-task.ts";
export {
  AUTHORIZATION_HEADER,
  BRANCH_HEADER,
  REQUEST_ID_HEADER,
  SESSION_USER_HEADER,
  TENANT_HEADER,
  TRACEPARENT_HEADER,
  TRACE_ID_HEADER,
  X_REQUEST_ID_HEADER,
  readBearerToken,
  readHeaderText,
  readRequestIdHeader,
  readTraceIdHeader,
} from "./context/request-headers.ts";

// ---- Database (Drizzle, multi-tenant) ----
export type { AppDatabase, AppTransactionDb, DbExecutor } from "./db/db-types.ts";
export { CORE_TENANT_ID, Database, TENANT_NOT_FOUND, TENANT_REQUIRED, isCoreTenant } from "./db/database.ts";
export { PoolManager } from "./db/pool-manager.ts";
export { TENANT_CHANGE_CHANNEL, TenantChangeListener, readNotifySummary } from "./db/tenant-listener.ts";
export { DEFAULT_SCHEMA, parseConnectionUrl, quoteIdentifier, type ParsedConnectionUrl } from "./db/db-url.ts";
export { buildTenantColumns, buildTenantEntity, type TenantEntity } from "./db/db-schema.ts";
export {
  DrizzleRepository,
  deleteRowById,
  findRowById,
  insertRow,
  readDbExecutor,
  updateRowById,
  type RowId,
} from "./db/db-repository.ts";
export {
  DrizzleTransaction,
  TransactionManager,
  runInTransaction,
  type ITransaction,
  type TransactionTask,
} from "./db/db-transaction.ts";

// ---- Search ----
export {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  buildOrderBy,
  buildSearchTermWhere,
  buildSearchWhere,
  readPaging,
  searchPage,
  searchRows,
  type Paging,
  type SearchPage,
} from "./query/search-page.ts";
export { findTableColumn, toFiltersWhere, toOneCond, toWhereCond, type QueryCondItem } from "./query/query-cond.ts";
export { idParamsSchema, searchFields, searchSchema, type IdParams, type SearchDto } from "./query/search-schema.ts";
export type { Static } from "typebox";

// ---- Logging (console + Kafka) ----
export type { AppLogger, LogContext, LogContextReader, LogData, LogEntry, LogLevel } from "./logging/log-types.ts";
export {
  ContextLogger,
  FixedLogContext,
  appLogger,
  buildLogEntry,
  createLogger,
  isLevelEnabled,
  readLogLevel,
  writeLog,
} from "./logging/app-logger.ts";
export { toLogJson } from "./logging/log-json.ts";
export { readLogSink, setLogSink, type LogSink } from "./logging/log-sink.ts";
export { MASK_TEXT, isMaskedKey, maskLogData, readMaskKeySet } from "./utils/log-mask.ts";

// ---- Kafka ----
export { KafkaLogSink } from "./kafka/kafka-log-sink.ts";
export {
  KafkaLogQueue,
  NO_TENANT_TOPIC_PART,
  TENANT_TOPIC_PLACEHOLDER,
  groupLogsByTopic,
  resolveLogTopic,
  toLogMessage,
  toTopicPart,
  type KafkaLogBatchSender,
  type KafkaLogQueueOptions,
} from "./kafka/kafka-log-queue.ts";
export {
  KafkaClient,
  toInboundMessage,
  toSaslOptions,
  type KafkaConsumerOptions,
  type KafkaInboundMessage,
  type KafkaMessageHandler,
} from "./kafka/kafka-client.ts";

// ---- JWT and HTTP ----
export { JwtService, isJwtShape, type SessionInput } from "./jwt/jwt-service.ts";
export { AppHttp, SERVICE_TOKEN_ROLE, type HttpHeaders, type HttpParams } from "./http/app-http.ts";

// ---- Utils ----
export { APP_ERROR_STATUS, AppError, isAppError } from "./utils/app-error.ts";
export { buildAuditColumns, type AuditColumns } from "./utils/audit-columns.ts";
export { DELETED_SUCCESSFULLY, LISTED_SUCCESSFULLY, LOADED_SUCCESSFULLY, SAVED_SUCCESSFULLY } from "./utils/reply-status.ts";
export { readErrorText, readOptionalNumber, readOptionalText, readText } from "./utils/text-util.ts";
