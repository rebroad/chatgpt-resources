#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { patchRepository } from "./reapply-chatgpt-patches.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultMessage = "chore: sync ChatGPT bundle and local patches";

function git(root, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.error) throw new Error(`Could not run git ${args[0]}: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

export function acceptUpdate(root = defaultRoot, message = defaultMessage) {
  const inside = git(root, ["rev-parse", "--show-toplevel"]).stdout.trim();
  if (fs.realpathSync(inside) !== fs.realpathSync(root)) {
    throw new Error(`Run from the repository root (detected ${inside}).`);
  }

  let patchPlan;
  try {
    patchPlan = patchRepository(root);
  } catch (error) {
    throw new Error(
      `I could not safely reapply the local GPU report changes, so I did not stage or commit anything. ${error.message} Review the updated browser code and docs index; update this script only after confirming the new patch location is safe.`,
    );
  }

  // Apply only after every patch has passed the preflight checks.
  patchRepository(root, { apply: true });
  git(root, ["add", "--all"]);
  const staged = git(root, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (staged.status === 0) {
    return { patchPlan, committed: false, message: "No updated files to commit." };
  }
  if (staged.status !== 1) {
    throw new Error("Could not determine whether there are staged changes; the repository was not committed.");
  }

  git(root, ["commit", "-m", message], { inherit: true });
  const commit = git(root, ["rev-parse", "--short", "HEAD"]).stdout.trim();
  return { patchPlan, committed: true, commit };
}

function main(args) {
  let root = defaultRoot;
  let message = defaultMessage;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root" && args[index + 1]) root = path.resolve(args[++index]);
    else if (args[index] === "--message" && args[index + 1]) message = args[++index];
    else throw new Error("Usage: accept-chatgpt-update.mjs [--root PATH] [--message TEXT]");
  }

  const result = acceptUpdate(root, message);
  for (const item of result.patchPlan) {
    process.stdout.write(`${item.status}: ${item.relativePath}\n`);
  }
  process.stdout.write(
    result.committed
      ? `Committed ChatGPT update as ${result.commit}.\n`
      : `${result.message}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
