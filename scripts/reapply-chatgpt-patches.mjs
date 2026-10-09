#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, "..");
const runtimePath = "cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs";
const documentsPath = "plugins/openai-bundled/plugins/chrome/docs/documents.json";
const gpuUrlCheck =
  '($URL.protocol==="chrome:"&&$URL.hostname.toLowerCase()==="gpu"&&$URL.port===""&&$URL.username===""&&$URL.password===""&&($URL.pathname===""||$URL.pathname==="/")&&$URL.search===""&&$URL.hash==="")';
const protocolCheckPattern =
  /([\w$]+)\.includes\(([\w$]+)\.protocol\)\?\{allowed:!0,reason:"allowed"\}:\{allowed:!1,reason:"unsupported_protocol"\}/g;
const gpuDocument = {
  description:
    "read when the user asks to inspect chrome://gpu or an internal GPU report tab cannot be claimed",
  mode: "lookup",
  name: "chrome-gpu-tab-support",
  when: { browserTypes: ["extension"] },
};
const screenshotAnchor =
  '  {\n    "description": "read when the user asks for screenshots",';
const gpuDocumentText = `  ${JSON.stringify(gpuDocument, null, 2).replaceAll("\n", "\n  ")},\n`;

function count(text, needle) {
  return text.split(needle).length - 1;
}

function planRuntime(root) {
  const fullPath = path.join(root, runtimePath);
  const source = fs.readFileSync(fullPath, "utf8");
  const checks = [...source.matchAll(protocolCheckPattern)];
  const patchedMarkers = [...source.matchAll(/\(([\w$]+)\.protocol==="chrome:"&&\1\.hostname\.toLowerCase\(\)==="gpu"/g)];
  if (
    checks.length === 1 &&
    patchedMarkers.length === 1 &&
    checks[0][2] === patchedMarkers[0][1] &&
    checks[0].index > patchedMarkers[0].index
  ) {
    return { fullPath, relativePath: runtimePath, source, next: source, status: "already-applied" };
  }
  if (checks.length === 1 && patchedMarkers.length === 0) {
    const [match] = checks;
    const original = match[0];
    const urlVariable = match[2];
    const patched = `${gpuUrlCheck.replaceAll("$URL", urlVariable)}||${match[0]}`;
    return {
      fullPath,
      relativePath: runtimePath,
      source,
      next: source.replace(original, patched),
      status: "would-apply",
    };
  }
  throw new Error(
    `${runtimePath}: expected one recognizable URL-protocol check or one exact GPU exception; found ${checks.length} protocol checks and ${patchedMarkers.length} GPU markers. Review the updated browser code before committing.`,
  );
}

function planDocuments(root) {
  const fullPath = path.join(root, documentsPath);
  const source = fs.readFileSync(fullPath, "utf8");
  let documents;
  try {
    documents = JSON.parse(source);
  } catch (error) {
    throw new Error(`${documentsPath}: invalid JSON (${error.message})`);
  }
  if (!Array.isArray(documents)) {
    throw new Error(`${documentsPath}: expected a JSON array; review upstream changes.`);
  }

  const matches = documents.filter((entry) => entry?.name === gpuDocument.name);
  if (matches.length === 1) {
    if (JSON.stringify(matches[0]) !== JSON.stringify(gpuDocument)) {
      throw new Error(`${documentsPath}: GPU entry differs from the expected entry; review it.`);
    }
    return { fullPath, relativePath: documentsPath, source, next: source, status: "already-applied" };
  }
  if (matches.length !== 0) {
    throw new Error(`${documentsPath}: found duplicate GPU entries; review upstream changes.`);
  }
  if (count(source, screenshotAnchor) !== 1) {
    throw new Error(
      `${documentsPath}: expected one screenshot entry insertion point; review upstream changes.`,
    );
  }
  return {
    fullPath,
    relativePath: documentsPath,
    source,
    next: source.replace(screenshotAnchor, `${gpuDocumentText}${screenshotAnchor}`),
    status: "would-apply",
  };
}

export function patchRepository(root = defaultRoot, { apply = false } = {}) {
  // Plan every edit before writing anything so upstream drift cannot partially apply.
  const plans = [planRuntime(root), planDocuments(root)];
  if (!apply) return plans;

  const pending = plans.filter((item) => item.status === "would-apply");
  const temporaries = [];
  try {
    for (const item of pending) {
      const mode = fs.statSync(item.fullPath).mode & 0o777;
      const temporary = `${item.fullPath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, item.next, { mode });
      temporaries.push({ ...item, temporary });
    }
    for (const item of temporaries) fs.renameSync(item.temporary, item.fullPath);
  } catch (error) {
    for (const item of temporaries) fs.rmSync(item.temporary, { force: true });
    throw error;
  }
  return plans;
}

function runCli(args) {
  let apply = false;
  let root = defaultRoot;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--apply") apply = true;
    else if (args[index] === "--check") apply = false;
    else if (args[index] === "--root" && args[index + 1]) root = path.resolve(args[++index]);
    else throw new Error("Usage: reapply-chatgpt-patches.mjs [--check|--apply] [--root PATH]");
  }

  const plans = patchRepository(root, { apply });
  for (const item of plans) {
    const status = apply && item.status === "would-apply" ? "applied" : item.status;
    process.stdout.write(`${status}: ${item.relativePath}\n`);
  }
  if (!apply && plans.some((item) => item.status === "would-apply")) {
    process.stdout.write("Known updates are ready; rerun with --apply to restore local patches.\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
