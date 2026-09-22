# constraints-tests

Generated from `CONSTRAINTS.md` by the **`constraints-generate-tests`**
pi tool (part of the `constraints-validate` extension). Do not hand-edit anything
in `generated/` — regenerate instead.

## Running

```bash
node constraints-tests/run.mjs
```

That wrapper is portable across Node versions (Node 22+ treats positional
`node --test` arguments as glob patterns, so a bare directory name does not
work there). Equivalently:

```bash
cd constraints-tests && node --test
```

No dependencies and no framework are required: the tests use Node's built-in
test runner and `node:assert/strict`, so they work in any repository regardless
of language or toolchain.

## Layout

| Path | Managed by | Notes |
| --- | --- | --- |
| `run.mjs` | the generator | Portable entry point: `node constraints-tests/run.mjs`. |
| `generated/` | the generator | Rewritten on every run. **Never edit.** |
| `generated/_harness.mjs` | the generator | Glob scope helpers and assertion helpers. |
| `generated/manifest.json` | the generator | Constraint → test mapping, severities, CONSTRAINTS.md hash. |
| `checks/` | you | Hand-written assertions. The generator never touches this folder. |

`node --test` discovers `*.test.mjs` recursively, so anything you add under
`checks/` runs alongside the generated tests automatically. No barrel file to
maintain.

## This suite

- 7 constraint(s): 5 machine-checked, 2 needing manual review.

### Needs manual review

These rules declare no machine-checkable directive. Their generated placeholder
is **skipped** — it cannot pass — and exists to remind you to verify the rule by
hand via the `constraints_validate` tool before marking a KANBAN card Implemented:

- `G001` (info) Create a TUI 4-channel tracker that makes my entire compositional workflow transparent to the end-user, and speeds up my compositional process.
- `HC005` (blocking) The web-hosted version must be a static client-side webpage. No shared terminal.

## Writing your own assertions

Drop a `*.test.mjs` file in `checks/`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, readText, inScope } from "../generated/_harness.mjs";

test("[HC002] album art source buffer is exactly 240x240", async () => {
	const source = await readText("src/core/pixelBuffer.ts");
	assert.match(source ?? "", /SOURCE_SIZE\s*=\s*240/);
});
```

Keeping the `[ID]` prefix in the test name lets `constraints-run-tests`
attribute the result to a constraint.

## Regeneration

Regeneration is deterministic: an unchanged `CONSTRAINTS.md` leaves every
generated file byte-identical. Files under `checks/` are never read, written,
or pruned.
