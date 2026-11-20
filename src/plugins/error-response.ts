// error-response.ts
// Turns any error into a dff-util ResponseType reply (what shared-lib-web readErrorMessage() reads):
//   AppError("INVALID_ADDRESS")   -> 200 { data: null, error: "INVALID_ADDRESS" }   (or the AppError status)
//   schema validation failed      -> 422 { data: null, error: "INVALID_DATA", message, details: [{ path, message }] }
//   body is not valid JSON        -> 400 { data: null, error: "INVALID_DATA", message }
//   unknown route                 -> 404 { data: null, error: "NOT_FOUND" }
//   any other error               -> 500 { data: null, error: "unknown", message }   (logged with its stack)
// For a wrapped error (Drizzle "Failed query: <sql> params: <values>") the reply message is the cause
// (the PostgreSQL message), so SQL and parameter values never reach the client; the log keeps everything.

import { ConstKeys } from "dff-util";
import type { ResponseType } from "../app-types.ts";
import { ElysiaError, NotFound, ParseError, ValidationError } from "elysia";
import { isAppError } from "../utils/app-error.ts";
import { readErrorText } from "../utils/text-util.ts";

export type ErrorReplyBody = ResponseType & {
  message?: string;
  details?: unknown;
};

export type ErrorKind = "app" | "client" | "server";

export type ErrorReply = {
  status: number;
  kind: ErrorKind;
  body: ErrorReplyBody;
};

/** Error code of an unexpected failure (the Encore APIError.unknown code). */
export const UNKNOWN_ERROR = "unknown";

const INTERNAL_SERVER_ERROR = 500;

type ValidationIssue = {
  path?: unknown;
  message?: unknown;
};

/** { path, message } of every validation problem. */
export function readValidationDetails(error: ValidationError): Array<{ path: string; message: string }> {
  const details: Array<{ path: string; message: string }> = [];
  const issues = ((error as unknown as { all?: ValidationIssue[] }).all ?? []) as ValidationIssue[];
  for (const issue of issues) {
    const path = typeof issue.path === "string" ? issue.path : "";
    const message = typeof issue.message === "string" ? issue.message : "";
    details.push({ path, message });
  }
  return details;
}

function readElysiaStatus(error: ElysiaError): number {
  const status = (error as unknown as { status?: unknown }).status;
  return typeof status === "number" ? status : INTERNAL_SERVER_ERROR;
}

/** Message for the client: the cause message of a wrapped error (no SQL / params), else the error message. */
export function readReplyMessage(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    return error.cause.message;
  }
  return readErrorText(error);
}

/** Status, kind (for the log level) and body of the reply for an error. */
export function toErrorReply(error: unknown): ErrorReply {
  if (isAppError(error)) {
    const body: ErrorReplyBody = { data: null, error: error.code };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    return { status: error.status, kind: "app", body };
  }
  if (error instanceof ValidationError) {
    const details = readValidationDetails(error);
    const body: ErrorReplyBody = { data: null, error: ConstKeys.INVALID_DATA, message: error.message, details };
    return { status: 422, kind: "client", body };
  }
  if (error instanceof ParseError) {
    const body: ErrorReplyBody = { data: null, error: ConstKeys.INVALID_DATA, message: error.message };
    return { status: 400, kind: "client", body };
  }
  if (error instanceof NotFound) {
    const body: ErrorReplyBody = { data: null, error: ConstKeys.NOT_FOUND };
    return { status: 404, kind: "client", body };
  }
  if (error instanceof ElysiaError) {
    const status = readElysiaStatus(error);
    const kind: ErrorKind = status < INTERNAL_SERVER_ERROR ? "client" : "server";
    const body: ErrorReplyBody = { data: null, error: UNKNOWN_ERROR, message: error.message };
    return { status, kind, body };
  }
  const message = readReplyMessage(error);
  const body: ErrorReplyBody = { data: null, error: UNKNOWN_ERROR, message };
  return { status: INTERNAL_SERVER_ERROR, kind: "server", body };
}

/** Log fields of an unexpected error (the same fields as the Encore LoggingMiddleware). */
export function readErrorLogData(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { error_message: String(error) };
  }
  const cause = error.cause as Record<string, unknown> | undefined;
  const source = (cause ?? error) as unknown as Record<string, unknown>;
  return {
    error_message: error.message,
    error_cause: cause instanceof Error ? cause.message : undefined,
    error_code: source.code,
    error_detail: source.detail,
    error_stack: error.stack,
  };
}
