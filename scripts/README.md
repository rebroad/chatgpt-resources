# Reapplying local ChatGPT bundle patches

After updating the ChatGPT bundle snapshot in this repository, check whether
the known local patches still match:

```sh
node scripts/reapply-chatgpt-patches.mjs --check
```

If the tool recognizes the updated bundle, apply the narrow `chrome://gpu`
runtime exception and restore its Chrome plugin documentation index entry with:

```sh
node scripts/reapply-chatgpt-patches.mjs --apply
```

The command is idempotent. It edits only the two repository files it reports.
If an expected search anchor is missing, duplicated, or changed, it exits with
an error before writing either file. Review that upstream change before
updating the patch tool; no AI assistance is needed for recognized updates.

Run the local fixture checks with:

```sh
node scripts/test-reapply-chatgpt-patches.mjs
```
