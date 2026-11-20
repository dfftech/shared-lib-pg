// auth-plugin.ts
// Checks the bearer token (signature, expiry, max session age) for every route of a module:
//   new Elysia().use(authPlugin()).post(...)                               // any signed-in user
//   new Elysia().use(authPlugin({ roles: ["SUPER_ADMIN", "TENANT_ADMIN"] }))   // one of these roles
// No / bad token -> 401 { data: null, error: "UNAUTHORIZED" }; no matching role -> 403 "FORBIDDEN".
// appPlugin() only decodes the token (for logs); this plugin is the check. Handlers get { sessionUser }.

import { ConstKeys } from "dff-util";
import { Elysia } from "elysia";
import type { SessionInfo } from "../app-types.ts";
import { requireRequestContext } from "../context/request-context.ts";
import { JwtService } from "../jwt/jwt-service.ts";
import { AppError } from "../utils/app-error.ts";

export type AuthPluginOptions = {
  /** The user needs one of these roles (any role when empty). */
  roles?: string[];
};

export type AuthProps = {
  sessionUser: SessionInfo;
};

/** True when the user has one of the roles (always true for an empty list). */
export function hasAnyRole(sessionUser: SessionInfo, roles: string[]): boolean {
  if (roles.length === 0) {
    return true;
  }
  const userRoles = sessionUser.roles ?? [];
  for (const role of roles) {
    const hasRole = userRoles.includes(role);
    if (hasRole) {
      return true;
    }
  }
  return false;
}

function verifySessionToken(token: string | undefined): SessionInfo {
  if (token === undefined) {
    throw new AppError(ConstKeys.UNAUTHORIZED, 401);
  }
  try {
    return JwtService.VerifyToken(token);
  } catch {
    throw new AppError(ConstKeys.UNAUTHORIZED, 401);
  }
}

function checkAccess(options: AuthPluginOptions): AuthProps {
  const context = requireRequestContext();
  const sessionUser = verifySessionToken(context.token);
  const roles = options.roles ?? [];
  const isAllowed = hasAnyRole(sessionUser, roles);
  if (!isAllowed) {
    throw new AppError(ConstKeys.FORBIDDEN, 403);
  }
  context.sessionUser = sessionUser;
  context.isSessionVerified = true;
  return { sessionUser };
}

/** Token (and role) check for the routes of the module that uses it. */
export function authPlugin(options: AuthPluginOptions = {}) {
  const checker = checkAccess.bind(null, options);
  return new Elysia().derive("plugin", checker);
}
