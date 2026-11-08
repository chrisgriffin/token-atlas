# Implementation Plan: ADR-002 names the destructured tokens key that rename leaves behind

**Branch**: `018-adr002-destructured-key` | **Spec**: [spec.md](./spec.md)

## Summary

One Consequences bullet in ADR-002, after the tokens-module key bullet. No code.

## Technical context

- Checked against the scan on `develop`: `scanIdentifiers` on `import { tokens } from "./tokens"` / `const { borderWidth: bw } = tokens` / `tokens.borderWidth` returns `tokens.borderWidth` and `bw`, but no `borderWidth` on the destructuring line.
- The repo has no `verify` script; its gate is the `run:` chain in `.github/workflows/build-check.yml`, which stands in for `npm run verify`.

## Surfaces touched

- `docs/adr/ADR-002-js-style-property-names.md` — the new Consequences bullet.
- `docs/architecture.md` — the Find References paragraph's list of what the ADR-002 rule skips names the destructured key too.
- `docs/adr/README.md` — index unchanged (no new record, title unchanged).
- Fleet surfaces: none — no Routine, plugin, reusable workflow, published surface, ruleset or directory change.
