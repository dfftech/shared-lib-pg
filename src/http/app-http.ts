// app-http.ts
// Calls to other services with the context of the current request passed on (dff-util Http):
//   authorization (the request token, or a service token with role "api"), request-id, x-tenant-id, x-branch-id.
//   const reply = await AppHttp.Post(`${MsUrl.main}/profile-search`, { searchTerm });
// Relative URLs start at the config http.apiBaseUrl. Service URLs (MsUrl) belong to the app config.

import { Http } from "dff-util";
import { readAppConfig } from "../config/app-config.ts";
import {
  AUTHORIZATION_HEADER,
  BRANCH_HEADER,
  REQUEST_ID_HEADER,
  TENANT_HEADER,
} from "../context/request-headers.ts";
import { readBranchId, readLogger, readRequestId, readSessionUser, readTenantId, readToken } from "../context/request-context.ts";
import { JwtService } from "../jwt/jwt-service.ts";

export type HttpParams = Record<string, unknown>;

export type HttpHeaders = Record<string, string>;

/** Role of the service token AppHttp makes when the request has no token. */
export const SERVICE_TOKEN_ROLE = "api";

function readServiceToken(): string | undefined {
  const session = readSessionUser();
  try {
    return JwtService.GenerateToken({ ...session, roles: [SERVICE_TOKEN_ROLE], type: SERVICE_TOKEN_ROLE });
  } catch {
    return undefined;
  }
}

export class AppHttp {
  /** Fixed authorization for every call (wins over the request token). */
  static AUTHORIZATION_TOKEN: string | undefined = undefined;

  /** config http.apiBaseUrl ("" when unset). */
  static BaseUrl(): string {
    const config = readAppConfig();
    return config.http.apiBaseUrl;
  }

  /** Absolute URL: http(s) URLs as they are, others after API_BASE_URL. */
  static FullUrl(url: string): string {
    const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
    if (isAbsolute) {
      return url;
    }
    const baseUrl = this.BaseUrl();
    return `${baseUrl}${url}`;
  }

  /** Headers that carry the request context to the next service. */
  static Headers(): HttpHeaders {
    const headers: HttpHeaders = { "Content-Type": "application/json", [REQUEST_ID_HEADER]: readRequestId() };
    const token = this.AUTHORIZATION_TOKEN ?? readToken() ?? readServiceToken();
    if (token !== undefined) {
      headers[AUTHORIZATION_HEADER] = `Bearer ${token}`;
    }
    const tenantId = readTenantId();
    if (tenantId !== undefined) {
      headers[TENANT_HEADER] = tenantId;
    }
    const branchId = readBranchId();
    if (branchId !== undefined) {
      headers[BRANCH_HEADER] = branchId;
    }
    return headers;
  }

  private static LogCall(method: string, url: string, params: unknown, headers: HttpHeaders): void {
    const logger = readLogger();
    logger.info(`HTTP ${method} call`, { url, params, headers });
  }

  /** GET with query params. */
  static async Get(url: string, params?: HttpParams): Promise<any> {
    const fullUrl = this.FullUrl(url);
    const headers = this.Headers();
    this.LogCall("GET", fullUrl, params, headers);
    return Http.Get(fullUrl, params, headers);
  }

  /** POST with a JSON body. */
  static async Post(url: string, body?: unknown): Promise<any> {
    const fullUrl = this.FullUrl(url);
    const headers = this.Headers();
    this.LogCall("POST", fullUrl, body, headers);
    return Http.Post(fullUrl, body, headers);
  }

  /** PUT with a JSON body. */
  static async Put(url: string, body?: unknown): Promise<any> {
    const fullUrl = this.FullUrl(url);
    const headers = this.Headers();
    this.LogCall("PUT", fullUrl, body, headers);
    return Http.Put(fullUrl, body, headers);
  }

  /** DELETE with query params. */
  static async Delete(url: string, params?: HttpParams): Promise<any> {
    const fullUrl = this.FullUrl(url);
    const headers = this.Headers();
    this.LogCall("DELETE", fullUrl, params, headers);
    return Http.Delete(fullUrl, params, headers);
  }
}
