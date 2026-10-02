#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { patchRepository } from "./reapply-chatgpt-patches.mjs";

const runtimePath = "cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs";
const documentsPath = "plugins/openai-bundled/plugins/chrome/docs/documents.json";
const originalCheck =
  'return Cg.includes(e.protocol)?{allowed:!0,reason:"allowed"}:{allowed:!1,reason:"unsupported_protocol"}';
const originalRuntime = `function validateUrl(e){${originalCheck}}`;
const originalDocuments = `${JSON.stringify(
  [{ description: "read when the user asks for screenshots", mode: "lookup", name: "screenshots" }],
  null,
  2,
)}\n`;

function fixture() {
  const root = fs.mkdtempSync(path.join("/var/tmp", "chatgpt-patches-test-"));
  for (const relative of [runtimePath, documentsPath]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  }
  fs.writeFileSync(path.join(root, runtimePath), originalRuntime);
  fs.writeFileSync(path.join(root, documentsPath), originalDocuments);
  return root;
}

const cleanups = [];
try {
  const root = fixture();
  cleanups.push(root);
  const check = patchRepository(root);
  assert.deepEqual(check.map(({ status }) => status), ["would-apply", "would-apply"]);
  assert.equal(fs.readFileSync(path.join(root, runtimePath), "utf8"), originalRuntime);

  const applied = patchRepository(root, { apply: true });
  assert.deepEqual(applied.map(({ status }) => status), ["would-apply", "would-apply"]);
  const runtime = fs.readFileSync(path.join(root, runtimePath), "utf8");
  assert.match(runtime, /hostname\.toLowerCase\(\)==="gpu"/);
  assert.match(runtime, /e\.pathname===""\|\|e\.pathname==="\/"/);
  assert.match(runtime, /e\.username===""&&e\.password===""/);
  assert.deepEqual(
    patchRepository(root).map(({ status }) => status),
    ["already-applied", "already-applied"],
  );

  const driftRoot = fixture();
  cleanups.push(driftRoot);
  fs.writeFileSync(path.join(driftRoot, runtimePath), "function validateUrl(e){return true}");
  assert.throws(() => patchRepository(driftRoot, { apply: true }), /Review upstream changes/);
  assert.equal(fs.readFileSync(path.join(driftRoot, documentsPath), "utf8"), originalDocuments);

  process.stdout.write("patch fixtures passed\n");
} finally {
  for (const root of cleanups) fs.rmSync(root, { recursive: true, force: true });
}
