// db-url.ts
// Connection URL parsing (same rules as the Encore core stack). The schema comes from the URL:
//   ?options=-c search_path=core   (URL-encoded: options=-c%20search_path%3Dcore)
// node-postgres does not read "options", so it is removed and the schema is set on every new connection.

export type ParsedConnectionUrl = {
  url: string;
  searchPath: string;
};

export const DEFAULT_SCHEMA = "public";

const OPTIONS_PARAM = /[?&]options=([^&]*)/i;

const OPTIONS_PARAM_ALL = /[?&]options=[^&]*/gi;

const SEARCH_PATH_OPTION = /search_path\s*=\s*([^\s&'"]+)/i;

const WRAPPING_QUOTES = /^['"]|['"]$/g;

const LEFTOVER_QUERY_START = /\?&/;

const EMPTY_QUERY_END = /\?$/;

const WEAK_SSL_MODE = /\bsslmode=(require|prefer|verify-ca)\b/gi;

function readSearchPath(optionsText: string): string | undefined {
  const unquoted = optionsText.replace(WRAPPING_QUOTES, "");
  let decoded = unquoted;
  try {
    decoded = decodeURIComponent(unquoted);
  } catch {
    decoded = unquoted;
  }
  const match = SEARCH_PATH_OPTION.exec(decoded);
  return match?.[1];
}

function keepQueryStart(matchedText: string): string {
  return matchedText.startsWith("?") ? "?" : "";
}

/**
 * Splits a connection URL into a node-postgres URL and its schema (search_path, default "public").
 * sslmode require / prefer / verify-ca become verify-full (current pg behavior, no warning).
 */
export function parseConnectionUrl(rawUrl: string | undefined): ParsedConnectionUrl {
  const trimmedUrl = rawUrl?.trim() ?? "";
  if (trimmedUrl === "") {
    return { url: "", searchPath: DEFAULT_SCHEMA };
  }
  const optionsMatch = OPTIONS_PARAM.exec(trimmedUrl);
  const optionsText = optionsMatch?.[1] ?? "";
  const searchPath = readSearchPath(optionsText) ?? DEFAULT_SCHEMA;
  const withoutOptions = trimmedUrl.replace(OPTIONS_PARAM_ALL, keepQueryStart);
  const withoutLeftover = withoutOptions.replace(LEFTOVER_QUERY_START, "?");
  const withoutEmptyQuery = withoutLeftover.replace(EMPTY_QUERY_END, "");
  const url = withoutEmptyQuery.replace(WEAK_SSL_MODE, "sslmode=verify-full");
  return { url, searchPath };
}

/** "name" -> "\"name\"" for SQL identifiers. */
export function quoteIdentifier(name: string): string {
  const escaped = name.replaceAll('"', '""');
  return `"${escaped}"`;
}
