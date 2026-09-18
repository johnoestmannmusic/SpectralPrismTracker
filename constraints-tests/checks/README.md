# checks/

Hand-written assertions for the rules in `CONSTRAINTS.md`.

This folder is **never touched** by the `constraints-generate-tests` tool — it
survives every regeneration. Use it to turn a rule that cannot be expressed as a
plain-language directive into a real test.

- Add files named `*.test.mjs`.
- Run `node constraints-tests/run.mjs` to run them.
- Import helpers from `../generated/_harness.mjs` (`ROOT`, `readText`,
  `inScope`, `compileMatcher`, `assertNoForbiddenContent`, `runShell`, ...).
- Name tests with a `[RULE-ID]` prefix so `constraints-run-tests` can attribute
  the result to a constraint.
