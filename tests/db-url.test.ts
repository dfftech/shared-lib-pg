// db-url.test.ts — connection URL: schema from options search_path, options removed, sslmode upgraded.
import { describe, expect, it } from "bun:test";
import { parseConnectionUrl, quoteIdentifier } from "../src/index.ts";

function testPlainUrl(): void {
  const parsed = parseConnectionUrl("postgresql://u:p@db:5432/app");
  expect(parsed.url).toBe("postgresql://u:p@db:5432/app");
  expect(parsed.searchPath).toBe("public");
}

function testEncodedOptions(): void {
  const parsed = parseConnectionUrl("postgresql://u:p@db:5432/app?options=-c%20search_path%3Dcore");
  expect(parsed.url).toBe("postgresql://u:p@db:5432/app");
  expect(parsed.searchPath).toBe("core");
}

function testOptionsWithOtherParams(): void {
  const parsed = parseConnectionUrl("postgresql://db/app?options='-c search_path=tenant_acme'&sslmode=require");
  expect(parsed.url).toBe("postgresql://db/app?sslmode=verify-full");
  expect(parsed.searchPath).toBe("tenant_acme");
  const second = parseConnectionUrl("postgresql://db/app?sslmode=prefer&options=-c%20search_path%3Dx");
  expect(second.url).toBe("postgresql://db/app?sslmode=verify-full");
  expect(second.searchPath).toBe("x");
}

function testEmptyUrl(): void {
  expect(parseConnectionUrl(undefined)).toEqual({ url: "", searchPath: "public" });
  expect(parseConnectionUrl("  ")).toEqual({ url: "", searchPath: "public" });
}

function testQuoteIdentifier(): void {
  expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
}

describe("parseConnectionUrl", () => {
  it("keeps a URL without options (schema public)", testPlainUrl);
  it("reads an URL-encoded search_path", testEncodedOptions);
  it("removes options next to other params and upgrades sslmode", testOptionsWithOtherParams);
  it("handles an empty URL", testEmptyUrl);
  it("quotes identifiers", testQuoteIdentifier);
});
