// test-config.ts
// App config of the tests (no env): quiet logs, a JWT secret, no tenants listener (PGlite has one backend).
//   useTestConfig({ log: { level: "info" } });   // in a test, then restoreTestConfig() after it

import { buildDefaultConfig, mergeAppConfig, setAppConfig, type AppConfig, type AppConfigOverrides } from "../src/index.ts";

export const TEST_JWT_SECRET = "test-secret-for-unit-tests";

export const TEST_CONFIG: AppConfig = mergeAppConfig(buildDefaultConfig(), {
  baseName: "TEST",
  serviceName: "test",
  log: { level: "error" },
  jwt: { secret: TEST_JWT_SECRET },
  db: { isTenantEventsEnabled: false },
});

/** Sets the test config with overrides; returns it. */
export function useTestConfig(overrides: AppConfigOverrides = {}): AppConfig {
  const config = mergeAppConfig(TEST_CONFIG, overrides);
  setAppConfig(config);
  return config;
}

/** Back to the plain test config. */
export function restoreTestConfig(): void {
  setAppConfig(TEST_CONFIG);
}
