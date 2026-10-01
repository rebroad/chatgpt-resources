#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [backgroundPath] = process.argv.slice(2);

if (!backgroundPath || path.basename(backgroundPath) !== "background.js") {
  process.stderr.write(
    "Usage: node patch-chrome-gpu-tab-support.mjs /path/to/background.js\n",
  );
  process.exit(2);
}

const source = fs.readFileSync(backgroundPath, "utf8");
const helper =
  'function isChromeGpuDiagnosticTab(e){try{const t=new URL(e);return t.protocol==="chrome:"&&t.hostname==="gpu"&&t.port===""&&t.username===""&&t.password===""&&(t.pathname===""||t.pathname==="/")&&t.search===""&&t.hash===""}catch{return!1}}';
const oldClaimGuard =
  'Qt(this.browserFamily,r.url)||Qt(this.browserFamily,r.pendingUrl))throw new Error(`${Se[this.browserFamily].shortDisplayName} internal tab ${t} cannot be claimed`);';
const newClaimGuard =
  '(Qt(this.browserFamily,r.url)&&!isChromeGpuDiagnosticTab(r.url))||(Qt(this.browserFamily,r.pendingUrl)&&!isChromeGpuDiagnosticTab(r.pendingUrl)))throw new Error(`${Se[this.browserFamily].shortDisplayName} internal tab ${t} cannot be claimed`);';
const oldSessionFilter =
  '.filter(t=>t.id!==void 0&&!Qt(this.browserFamily,t.url))';
const newSessionFilter =
  '.filter(t=>t.id!==void 0&&(!Qt(this.browserFamily,t.url)||isChromeGpuDiagnosticTab(t.url)))';
const oldHelperAnchor =
  'function Qt(e,t){return t!=null&&Se[e].internalUrlSchemes.some(r=>t.startsWith(`${r}://`))}';

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

const alreadyPatched =
  source.includes(helper) &&
  source.includes(newClaimGuard) &&
  source.includes(newSessionFilter);

if (alreadyPatched) {
  process.stdout.write("Chrome GPU tab support is already patched.\n");
  process.exit(0);
}

for (const [label, needle] of [
  ["claim guard", oldClaimGuard],
  ["session tab filter", oldSessionFilter],
  ["internal URL helper", oldHelperAnchor],
]) {
  if (countOccurrences(source, needle) !== 1) {
    throw new Error(`Expected exactly one unmodified ${label} in ${backgroundPath}`);
  }
}

const patched = source
  .replace(oldHelperAnchor, `${oldHelperAnchor}${helper}`)
  .replace(oldClaimGuard, newClaimGuard)
  .replace(oldSessionFilter, newSessionFilter);

const temporaryPath = `${backgroundPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temporaryPath, patched, { mode: fs.statSync(backgroundPath).mode });
  fs.renameSync(temporaryPath, backgroundPath);
} catch (error) {
  fs.rmSync(temporaryPath, { force: true });
  throw error;
}

process.stdout.write(`Patched ${backgroundPath} for exact chrome://gpu/ tab access.\n`);
