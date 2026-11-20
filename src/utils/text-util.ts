// text-util.ts
// Small readers for DTO values before they are saved:
//   readText("  a ") -> "a"     readOptionalText("") -> null     readOptionalNumber("4.5") -> 4.5

/** Trimmed text of any value ("" for null / undefined). */
export function readText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return text.trim();
}

/** Trimmed text, or null when empty. */
export function readOptionalText(value: unknown): string | null {
  const text = readText(value);
  return text === "" ? null : text;
}

/** Finite number, or null when empty or not a number. */
export function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readErrorField(error: unknown, field: "text" | "message"): string | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const errorRecord = error as Record<string, unknown>;
  const value = errorRecord[field];
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

function readErrorData(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("data" in error)) {
    return undefined;
  }
  const data = error.data;
  if (data === undefined) {
    return undefined;
  }
  if (typeof data === "string") {
    return data.trim() === "" ? undefined : data;
  }
  try {
    const serializedData = JSON.stringify(data);
    if (serializedData !== undefined) {
      return serializedData;
    }
  } catch {
    return String(data);
  }
  return String(data);
}

/** Text or message of a thrown value, JSON when available, otherwise its string representation. */
export function readErrorText(error: unknown): string {
  const errorText = readErrorField(error, "text");
  if (errorText !== undefined) {
    return errorText;
  }
  const errorMessage = readErrorField(error, "message");
  if (errorMessage !== undefined) {
    return errorMessage;
  }
  const errorData = readErrorData(error);
  if (errorData !== undefined) {
    return errorData;
  }
  try {
    const serializedError = JSON.stringify(error);
    if (serializedError !== undefined) {
      return serializedError;
    }
  } catch {
    return String(error);
  }
  return String(error);
}
