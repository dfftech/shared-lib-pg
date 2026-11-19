// check-code-style.mjs
//
// Checks the "easy to read" coding rules of shared-bun-elysia (same rules as shared-lib-web).
// Run it with: bun scripts/check-code-style.mjs src example/src
//
// Rule 1 - NO_NESTED_FUNCTION
//   A function must not be written inside another function.
//   Write every helper function at the top level of the file (class methods are top level too).
//
// Rule 2 - NO_CALL_INSIDE_CALL
//   A function call must not be passed straight into another call.
//   Bad:  saveUser(readUser());
//   Good: const user = readUser();
//         saveUser(user);
//   Backend exception: schema builders may nest, t.Optional(t.String()).
//
// Rule 3 - NO_CHAINED_CALL
//   Do not call a method on the result of another call.
//   Bad:  readName().trim();
//   Good: const name = readName();
//         name.trim();
//   Backend exception: builder chains of Elysia (new Elysia().use(x).get(...)) and
//   Drizzle (db.select().from(t).where(w), text("id").primaryKey()) - see BUILDER_METHODS.
//
// Rule 4 - FILE_NAMING
//   File names are lowercase words joined with "-", with "." for a role suffix.
//   Good: app-plugin.ts, request-context.ts, address.service.ts, kafka-logger.test.ts
//   Bad:  AppPlugin.ts, requestContext.ts, address_service.ts
//   Checked in the given folders and also in tests/, scripts/ and .agent/skills/.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = [".ts"];

const NAMED_EXTENSIONS = [".ts", ".mjs", ".json", ".md", ".sql", ".rest"];

const NAMING_ONLY_FOLDERS = ["tests", "scripts", ".agent/skills"];

const FILE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;

// Methods that build an Elysia app or a Drizzle query / column. A chain of these reads top to bottom
// like a table of routes or a SQL statement, so Rule 3 allows them.
const BUILDER_METHODS = new Set([
  // Elysia app builder
  "use", "get", "post", "put", "patch", "delete", "all", "head", "options", "route", "ws",
  "group", "guard", "derive", "resolve", "decorate", "state", "model", "macro", "headers", "wrap", "as",
  "onRequest", "onParse", "onTransform", "onBeforeHandle", "onAfterHandle", "mapResponse",
  "onAfterResponse", "onError", "onStart", "onStop", "trace", "listen", "mount",
  // Drizzle query builder
  "from", "where", "limit", "offset", "orderBy", "groupBy", "having", "for",
  "leftJoin", "rightJoin", "innerJoin", "fullJoin", "set", "values", "returning",
  "onConflictDoUpdate", "onConflictDoNothing", "$dynamic",
  // Drizzle column builder
  "primaryKey", "notNull", "default", "defaultNow", "defaultRandom", "references", "unique",
  "array", "$type", "$defaultFn", "$onUpdate", "$onUpdateFn", "generatedAlwaysAs",
]);

// Owners whose calls may nest inside each other (Rule 2): the Elysia / TypeBox schema builder "t".
const SCHEMA_BUILDER_OWNERS = new Set(["t"]);

const problems = [];

function isSourceFile(filePath) {
  for (const extension of SOURCE_EXTENSIONS) {
    const hasExtension = filePath.endsWith(extension);
    if (hasExtension) {
      return true;
    }
  }
  return false;
}

function collectFiles(folderPath, foundFiles) {
  const hasFolder = existsSync(folderPath);
  if (!hasFolder) {
    return foundFiles;
  }
  const entryNames = readdirSync(folderPath);
  for (const entryName of entryNames) {
    const entryPath = join(folderPath, entryName);
    const entryStats = statSync(entryPath);
    if (entryStats.isDirectory()) {
      collectFiles(entryPath, foundFiles);
      continue;
    }
    foundFiles.push(entryPath);
  }
  return foundFiles;
}

function hasNamedExtension(filePath) {
  for (const extension of NAMED_EXTENSIONS) {
    const hasExtension = filePath.endsWith(extension);
    if (hasExtension) {
      return true;
    }
  }
  return false;
}

function checkFileName(filePath) {
  const isNamedFile = hasNamedExtension(filePath);
  if (!isNamedFile) {
    return;
  }
  const fileName = basename(filePath);
  const extension = extname(fileName);
  const nameWithoutExtension = fileName.slice(0, -extension.length);
  const isValidName = FILE_NAME_PATTERN.test(nameWithoutExtension);
  if (!isValidName) {
    const problem = `${filePath}  FILE_NAMING  use lowercase words joined with "-" (and "." for a role), for example app-plugin.ts`;
    problems.push(problem);
  }
}

function isFunctionNode(node) {
  if (ts.isFunctionDeclaration(node)) return true;
  if (ts.isFunctionExpression(node)) return true;
  if (ts.isArrowFunction(node)) return true;
  if (ts.isMethodDeclaration(node)) return true;
  if (ts.isGetAccessorDeclaration(node)) return true;
  if (ts.isSetAccessorDeclaration(node)) return true;
  if (ts.isConstructorDeclaration(node)) return true;
  return false;
}

function isCallNode(node) {
  if (ts.isCallExpression(node)) return true;
  if (ts.isNewExpression(node)) return true;
  if (ts.isAwaitExpression(node)) {
    return isCallNode(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) {
    return isCallNode(node.expression);
  }
  return false;
}

/** t.String(), t.Optional(...): a call on a schema builder owner. */
function isSchemaBuilderCall(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const calledExpression = node.expression;
  if (!ts.isPropertyAccessExpression(calledExpression)) {
    return false;
  }
  const owner = calledExpression.expression;
  return ts.isIdentifier(owner) && SCHEMA_BUILDER_OWNERS.has(owner.text);
}

function addProblem(sourceFile, node, ruleName, message) {
  const startPosition = node.getStart(sourceFile);
  const location = sourceFile.getLineAndCharacterOfPosition(startPosition);
  const lineNumber = location.line + 1;
  const columnNumber = location.character + 1;
  const problem = `${sourceFile.fileName}:${lineNumber}:${columnNumber}  ${ruleName}  ${message}`;
  problems.push(problem);
}

function checkCallArguments(sourceFile, node) {
  const callArguments = node.arguments ?? [];
  const isSchemaCall = isSchemaBuilderCall(node);
  for (const argument of callArguments) {
    const argumentIsCall = isCallNode(argument);
    if (!argumentIsCall) {
      continue;
    }
    const isNestedSchema = isSchemaCall && isSchemaBuilderCall(argument);
    if (isNestedSchema) {
      continue;
    }
    addProblem(sourceFile, argument, "NO_CALL_INSIDE_CALL", "store the inner call in a const first");
  }
}

function checkChainedCall(sourceFile, node) {
  const calledExpression = node.expression;
  const isPropertyAccess = ts.isPropertyAccessExpression(calledExpression);
  if (!isPropertyAccess) {
    return;
  }
  const ownerIsCall = isCallNode(calledExpression.expression);
  if (!ownerIsCall) {
    return;
  }
  const methodName = calledExpression.name.text;
  const isBuilderStep = BUILDER_METHODS.has(methodName);
  if (isBuilderStep) {
    return;
  }
  addProblem(sourceFile, node, "NO_CHAINED_CALL", "store the first call result in a const first");
}

function visitNode(sourceFile, node, functionDepth) {
  let nextDepth = functionDepth;
  const nodeIsFunction = isFunctionNode(node);
  if (nodeIsFunction) {
    if (functionDepth > 0) {
      addProblem(sourceFile, node, "NO_NESTED_FUNCTION", "move this function to the top level of the file");
    }
    nextDepth = functionDepth + 1;
  }
  const nodeIsCall = ts.isCallExpression(node) || ts.isNewExpression(node);
  if (nodeIsCall) {
    checkCallArguments(sourceFile, node);
  }
  if (ts.isCallExpression(node)) {
    checkChainedCall(sourceFile, node);
  }
  const childNodes = node.getChildren(sourceFile);
  for (const childNode of childNodes) {
    visitNode(sourceFile, childNode, nextDepth);
  }
}

function checkFile(filePath) {
  const fileText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  visitNode(sourceFile, sourceFile, 0);
}

function main() {
  const folderArguments = process.argv.slice(2);
  const folders = folderArguments.length > 0 ? folderArguments : ["src"];
  const filePaths = [];
  for (const folder of folders) {
    collectFiles(folder, filePaths);
  }
  const namingOnlyPaths = [];
  for (const folder of NAMING_ONLY_FOLDERS) {
    collectFiles(folder, namingOnlyPaths);
  }
  for (const filePath of filePaths) {
    checkFileName(filePath);
    const isSource = isSourceFile(filePath);
    if (isSource) {
      checkFile(filePath);
    }
  }
  for (const filePath of namingOnlyPaths) {
    checkFileName(filePath);
  }
  if (problems.length > 0) {
    const report = problems.join("\n");
    console.error(report);
    console.error(`\nFound ${problems.length} code style problem(s). See CODING_RULES.md.`);
    process.exit(1);
  }
  console.log(`Code style OK (${filePaths.length} files checked).`);
}

main();
