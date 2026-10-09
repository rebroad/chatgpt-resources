#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptUpdate } from "./accept-chatgpt-update.mjs";

const runtimePath = "cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs";
const documentsPath = "plugins/openai-bundled/plugins/chrome/docs/documents.json";
const runtime =
  'function check(t){let e;try{e=new URL(t)}catch{return{allowed:!1,reason:"invalid_url"}}return Rg.includes(e.protocol)?{allowed:!0,reason:"allowed"}:{allowed:!1,reason:"unsupported_protocol"}}';
const documents = `${JSON.stringify(
  [{ description: "read when the user asks for screenshots", mode: "lookup", name: "screenshots" }],
  null,
  2,
)}\n`;

function makeRepo() {
  const root = fs.mkdtempSync(path.join("/var/tmp", "chatgpt-update-accept-test-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "Patch test"]);
  execFileSync("git", ["-C", root, "config", "user.email", "patch-test@example.invalid"]);
  for (const relative of [runtimePath, documentsPath]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  }
  fs.writeFileSync(path.join(root, runtimePath), runtime);
  fs.writeFileSync(path.join(root, documentsPath), documents);
  fs.writeFileSync(path.join(root, "bundle-update.txt"), "accepted update\n");
  execFileSync("git", ["-C", root, "add", "--all"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture baseline"]);
  return root;
}

const roots = [];
try {
  const root = makeRepo();
  roots.push(root);
  fs.writeFileSync(path.join(root, "bundle-update.txt"), "new accepted update\n");
  const result = acceptUpdate(root);
  assert.equal(result.committed, true);
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }), "");
  const commitSubject = execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], {
    encoding: "utf8",
  }).trim();
  assert.equal(commitSubject, "chore: sync ChatGPT bundle and local patches");

  const driftRoot = makeRepo();
  roots.push(driftRoot);
  fs.writeFileSync(path.join(driftRoot, runtimePath), "function check(t){return true}");
  assert.throws(() => acceptUpdate(driftRoot), /did not stage or commit anything/);
  assert.equal(
    execFileSync("git", ["-C", driftRoot, "diff", "--cached", "--name-only"], { encoding: "utf8" }),
    "",
  );
  assert.equal(
    execFileSync("git", ["-C", driftRoot, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim(),
    "fixture baseline",
  );
  process.stdout.write("update acceptance fixtures passed\n");
} finally {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
