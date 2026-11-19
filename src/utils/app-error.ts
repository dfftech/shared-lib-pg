// app-error.ts
// Expected failure (validation, not found, no access). Services throw it, appPlugin() turns it into
//   { data: null, error: code }
// with HTTP 200 by default (the reply of the Encore core stack, read by shared-lib-web), or the given status.
//   throw new AppError("INVALID_ADDRESS");
//   throw new AppError(ConstKeys.UNAUTHORIZED, 401);

/** HTTP status of an AppError reply when none is given (same as the Encore core stack). */
export const APP_ERROR_STATUS = 200;

export class AppError extends Error {
  readonly code: string;

  readonly status: number;

  readonly details: unknown;

  constructor(code: string, status: number = APP_ERROR_STATUS, details?: unknown) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** True for an AppError (also one from another copy of this library). */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) {
    return true;
  }
  if (error === null || typeof error !== "object") {
    return false;
  }
  const record = error as Record<string, unknown>;
  return record.name === "AppError" && typeof record.code === "string";
}
