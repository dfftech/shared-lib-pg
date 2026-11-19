// quiet-console.ts
// Mutes console output in tests that check logs another way (fake Kafka sender) or that pass bad tokens on
// purpose (dff-util JwtVerify writes "Invalid JWT" to console.error).

const originalConsole = { log: console.log, warn: console.warn, error: console.error };

function ignoreOutput(): void {
  // Muted in this test file.
}

/** Mutes console.log / warn / error. */
export function muteConsole(): void {
  console.log = ignoreOutput;
  console.warn = ignoreOutput;
  console.error = ignoreOutput;
}

/** Restores the console. */
export function restoreConsole(): void {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
