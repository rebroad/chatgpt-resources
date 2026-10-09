# Reapplying local ChatGPT bundle patches

After updating the ChatGPT bundle snapshot in this repository, run one command
from the repository root:

```sh
node scripts/accept-chatgpt-update.mjs
```

It checks whether the known local patches still match, applies the narrow
`chrome://gpu` runtime exception and Chrome plugin documentation index entry,
stages all repository changes, and commits them. The default commit message is
`chore: sync ChatGPT bundle and local patches`; override it with `--message`.

The patch check runs before staging. If the updated browser code or docs no
longer match a known safe pattern, it exits with an explanation and does not
stage or commit anything. Review the changed area, then update the patch tool
only after confirming the new location preserves the root-only URL exception.
The operation is idempotent when the local patches are already present.

The lower-level check and apply commands remain available for diagnosis:

```sh
node scripts/reapply-chatgpt-patches.mjs --check
node scripts/reapply-chatgpt-patches.mjs --apply
```

Run the local fixture checks with:

```sh
node scripts/test-reapply-chatgpt-patches.mjs
node scripts/test-accept-chatgpt-update.mjs
```
