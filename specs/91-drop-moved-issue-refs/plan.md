# Plan: Two test comments cite #36, an issue moved to a tracker this public repo cannot link to

## Technical context

- Comments only. `grep -rnE '#36([^0-9]|$)' src test docs` finds exactly two lines: `test/core/rename-alias.test.ts:2` and `test/integration/deprecation-workflow.test.ts:2`, each reading `(spec 019, #36)`.
- Both become `(spec 019)`; spec 019 is `specs/019-deprecation-workflow-setting/` in this repo, so each line still points at its source.

## Surfaces touched

- `test/core/rename-alias.test.ts` — header comment, line 2
- `test/integration/deprecation-workflow.test.ts` — header comment, line 2
- none — no code, workflow, `package.json`, `.vscodeignore`, doc, ruleset, vault note or published surface changes; no cost
