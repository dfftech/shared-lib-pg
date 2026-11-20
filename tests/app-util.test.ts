import { describe, expect, it } from "bun:test";
import {
  RequestContext,
  branch_id,
  buildUnknownSessionUser,
  core_db,
  createRequestContext,
  env,
  env_base_name,
  get_db,
  logger,
  query_params,
  readSessionUser,
  request_id,
  runWithContext,
  session_db,
  session_meta,
  session_user,
  tenant_id,
  token,
} from "../src/index.ts";
import { restoreTestConfig, useTestConfig } from "./test-config.ts";

describe("app-util", () => {
  it("reads BASE_NAME-prefixed environment variables without changing key case semantics", () => {
    const previousValue = process.env.TEST_DB_URL;
    useTestConfig({ baseName: "test" });
    process.env.TEST_DB_URL = "postgres://example";
    try {
      expect(env_base_name()).toBe("TEST");
      expect(env("db_url")).toBe("postgres://example");
    } finally {
      if (previousValue === undefined) {
        delete process.env.TEST_DB_URL;
      } else {
        process.env.TEST_DB_URL = previousValue;
      }
      restoreTestConfig();
    }
  });

  it("reads session and query data from the current request context", () => {
    const sessionUser = { id: "user-42", roles: [], key: "key", createdAt: "now" };
    const context = new RequestContext({
      requestId: "request-42",
      method: "GET",
      path: "/items",
      pathAndQuery: "/items?tag=first&tag=last&search=hello+world",
      token: "jwt-token",
      tenantId: "tenant-42",
      branchId: "branch-42",
      sessionUser,
    });

    const result = runWithContext(context, () => {
      const metadata = session_meta();
      return {
        logger: logger(),
        sessionUser: session_user(),
        requestId: request_id(),
        authToken: token(),
        tenantId: tenant_id(),
        branchId: branch_id(),
        query: query_params(),
        metadata,
      };
    });

    expect(result.logger).toBe(context.logger);
    expect(result.sessionUser).toEqual(sessionUser);
    expect(result.requestId).toBe("request-42");
    expect(result.authToken).toBe("jwt-token");
    expect(result.tenantId).toBe("tenant-42");
    expect(result.branchId).toBe("branch-42");
    expect(result.query).toEqual({ tag: "last", search: "hello world" });
    expect(result.metadata).toEqual({
      logger: context.logger,
      session_user: sessionUser,
      request_id: "request-42",
      token: "jwt-token",
      tenant_id: "tenant-42",
      branch_id: "branch-42",
    });
  });

  it("captures query parameters when creating an HTTP request context", () => {
    const request = new Request("http://localhost/items?limit=10&search=hello+world");
    const context = createRequestContext(request);
    const query = runWithContext(context, query_params);
    expect(query).toEqual({ limit: "10", search: "hello world" });
  });

  it("uses safe request defaults outside a request and requires request database context", async () => {
    expect(request_id()).toBe("-");
    expect(session_user()).toEqual(buildUnknownSessionUser());
    expect(query_params()).toEqual({});
    expect(() => core_db()).toThrow("REQUEST_CONTEXT_REQUIRED");
    expect(() => session_db()).toThrow("SESSION_DB_REQUIRED");
    await expect(get_db("tenant-42")).rejects.toThrow("REQUEST_CONTEXT_REQUIRED");
    expect(readSessionUser()).toEqual(buildUnknownSessionUser());
  });
});
