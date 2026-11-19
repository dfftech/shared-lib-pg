// request-headers.ts
// Header names shared with the Encore core stack and shared-lib-web, and readers for them.
// Header values are trimmed and cut to 128 characters before they reach logs.

export const REQUEST_ID_HEADER = "request-id";

export const X_REQUEST_ID_HEADER = "x-request-id";

export const TENANT_HEADER = "x-tenant-id";

export const BRANCH_HEADER = "x-branch-id";

export const TRACE_ID_HEADER = "x-trace-id";

export const TRACEPARENT_HEADER = "traceparent";

export const AUTHORIZATION_HEADER = "authorization";

export const SESSION_USER_HEADER = "session-user-id";

const MAX_HEADER_VALUE_LENGTH = 128;

const TOKEN_PREFIX = /^(bearer|jwt)\s+/i;

/** Trimmed header value (max 128 characters), or undefined when missing or empty. */
export function readHeaderText(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  if (value === null) {
    return undefined;
  }
  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return undefined;
  }
  return trimmedValue.slice(0, MAX_HEADER_VALUE_LENGTH);
}

/** request-id (or x-request-id) header, or a new UUID. */
export function readRequestIdHeader(headers: Headers): string {
  const requestId = readHeaderText(headers, REQUEST_ID_HEADER) ?? readHeaderText(headers, X_REQUEST_ID_HEADER);
  return requestId ?? crypto.randomUUID();
}

/** x-trace-id header, else the trace id of a W3C traceparent header ("00-<trace id>-<span id>-01"). */
export function readTraceIdHeader(headers: Headers): string | undefined {
  const traceId = readHeaderText(headers, TRACE_ID_HEADER);
  if (traceId !== undefined) {
    return traceId;
  }
  const traceparent = readHeaderText(headers, TRACEPARENT_HEADER);
  if (traceparent === undefined) {
    return undefined;
  }
  const parts = traceparent.split("-");
  return parts[1];
}

/** Token of the authorization header without "Bearer " / "JWT ". */
export function readBearerToken(headers: Headers): string | undefined {
  const value = headers.get(AUTHORIZATION_HEADER);
  if (value === null) {
    return undefined;
  }
  const withoutPrefix = value.replace(TOKEN_PREFIX, "");
  const token = withoutPrefix.trim();
  return token === "" ? undefined : token;
}
