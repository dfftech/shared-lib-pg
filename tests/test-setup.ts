// test-setup.ts
// Loaded before every test file (bunfig.toml): the library reads the test config, never env.

import { restoreTestConfig } from "./test-config.ts";

restoreTestConfig();
