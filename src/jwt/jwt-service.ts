// jwt-service.ts
// JWT of the core stack (dff-util JwtEncode / JwtVerify / JwtDecode), so tokens from the Encore services and
// from Elysia services are the same. Settings from the app config (jwt):
//   secret        required to sign / verify (no default secret)
//   key           "key" claim
//   expiresIn     token lifetime in seconds
//   maxExpiresIn  max session age in seconds (regenerate stops after it)

import { JwtDecode, JwtEncode, JwtValid, JwtVerify, type SessionInfo } from "dff-util";
import { readAppConfig } from "../config/app-config.ts";
import { readTenantId } from "../context/request-context.ts";

export type SessionInput = Partial<SessionInfo> & Pick<SessionInfo, "id" | "roles">;

const JWT_PART_COUNT = 3;

/** True when the text looks like a JWT (three dot-separated parts). */
export function isJwtShape(token: string): boolean {
  const parts = token.split(".");
  return parts.length === JWT_PART_COUNT;
}

function readCreatedTime(session: SessionInfo): number {
  if (!session.createdAt) {
    throw new Error("Invalid session: createdAt is missing");
  }
  const createdDate = new Date(session.createdAt);
  const createdTime = createdDate.getTime();
  if (Number.isNaN(createdTime)) {
    throw new Error("Invalid session: createdAt is malformed");
  }
  return createdTime;
}

export class JwtService {
  /** Signing secret (config jwt.secret). Throws when not set. */
  static Secret(): string {
    const config = readAppConfig();
    const secret = config.jwt.secret;
    if (secret === "" || secret === "-") {
      throw new Error("JWT configuration not available: set config jwt.secret");
    }
    return secret;
  }

  /** "key" claim (config jwt.key). */
  static Key(): string {
    const config = readAppConfig();
    return config.jwt.key;
  }

  /** Token lifetime in seconds (config jwt.expiresIn). */
  static ExpiresIn(): number {
    const config = readAppConfig();
    return config.jwt.expiresIn;
  }

  /** Max session age in seconds (config jwt.maxExpiresIn). */
  static MaxExpiresIn(): number {
    const config = readAppConfig();
    return config.jwt.maxExpiresIn;
  }

  /** Session payload with key, createdAt and the request tenant filled in. */
  static BuildSession(session: SessionInput): SessionInfo {
    const now = new Date();
    const createdAt = session.createdAt || now.toISOString();
    const tenant = readTenantId();
    return { key: this.Key(), createdAt, tenant, ...session };
  }

  /** Signed token for a session; expiresIn in seconds (default config jwt.expiresIn). */
  static GenerateToken(session: SessionInput, expiresIn?: number): string {
    const fullSession = this.BuildSession(session);
    const secret = this.Secret();
    const lifetime = expiresIn ?? this.ExpiresIn();
    return JwtEncode(fullSession, secret, lifetime);
  }

  /** Checks signature, expiry and max session age; returns the session or throws. */
  static VerifyToken(token: string): SessionInfo {
    const secret = this.Secret();
    const session = JwtVerify(token, secret) as SessionInfo;
    const createdTime = readCreatedTime(session);
    const maxAgeMs = this.MaxExpiresIn() * 1000;
    if (Date.now() > createdTime + maxAgeMs) {
      throw new Error("Session expired: exceeded max token age");
    }
    return session;
  }

  /** Session of a token without checking the signature. */
  static DecodeToken(token: string): SessionInfo {
    return JwtDecode(token) as SessionInfo;
  }

  /** Session of a token without checking the signature, or undefined when it can not be read. */
  static TryDecodeToken(token: string | undefined): SessionInfo | undefined {
    if (token === undefined) {
      return undefined;
    }
    const isJwt = isJwtShape(token);
    if (!isJwt) {
      return undefined;
    }
    try {
      const session = JwtDecode(token) as SessionInfo;
      return typeof session.id === "string" ? session : undefined;
    } catch {
      return undefined;
    }
  }

  /** True when the token is not expired. */
  static IsValid(token: string): boolean {
    return JwtValid(token);
  }

  /** ISO time a token expires: createdAt (default now) + expiresIn seconds. */
  static ExpiresAt(expiresIn: number, createdAt?: string): string {
    const baseDate = createdAt ? new Date(createdAt) : new Date();
    const expiresTime = baseDate.getTime() + expiresIn * 1000;
    const expiresDate = new Date(expiresTime);
    return expiresDate.toISOString();
  }

  /** ISO time a session can no longer be regenerated: createdAt + jwt.maxExpiresIn. */
  static MaxExpiresAt(createdAt: string): string {
    const createdDate = new Date(createdAt);
    const maxTime = createdDate.getTime() + this.MaxExpiresIn() * 1000;
    const maxDate = new Date(maxTime);
    return maxDate.toISOString();
  }

  /** New token for a (possibly expired) session that is still within the max session age. */
  static RegenerateToken(token: string, expiresIn?: number): string {
    const session = this.DecodeToken(token);
    const createdTime = readCreatedTime(session);
    const maxAgeMs = this.MaxExpiresIn() * 1000;
    if (Date.now() > createdTime + maxAgeMs) {
      throw new Error("Session expired: exceeded max token age");
    }
    return this.GenerateToken(session, expiresIn);
  }
}
