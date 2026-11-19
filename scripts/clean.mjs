// Removes a build folder before a fresh build. Default "dist".
//   bun scripts/clean.mjs            -> removes dist
//   bun scripts/clean.mjs coverage   -> removes coverage
import { rmSync } from "node:fs";

const folderArgument = process.argv[2];
const folder = folderArgument ?? "dist";
const removeOptions = { recursive: true, force: true };
rmSync(folder, removeOptions);
