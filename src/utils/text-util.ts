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

/** Error message of any thrown value. */
export function readErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
