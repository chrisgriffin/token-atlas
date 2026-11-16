# Plan: Dependabot minimatch update: the scheduled update job fails on every attempt since 2026-11-07

## Technical context

- `npm ls minimatch` on `develop`: 10.2.6 (`typescript-eslint`, `@vscode/test-cli`, `glob` 13, `test-exclude`), 10.2.5 (`glob` 11 under `@vscode/vsce`), 9.0.9 (`mocha`, `glob` 10), 3.1.5 (`eslint`, `@vscode/vsce`) — every non-3.x copy is in the advisory range and pinned there by its parent.
- Consumers keep working on 11 / `glob` 14: `mocha` uses `{ minimatch }`, `glob.hasMagic`, `glob.Glob`; `test-exclude` and `@vscode/test-cli` use `{ glob }`/`{ minimatch }`; `@vscode/vsce` reads `minimatch` default export from its own 3.1.5 copy.
- `test/ci/security-overrides.test.ts` asserted "every copy ≥ patched", which a legitimate 3.x copy fails; it becomes a vulnerable-range check.

## Surfaces touched

- `package.json` `overrides` and `package-lock.json` — devDependency tree only; `dependencies` and `esbuild.mjs` untouched, so invariant 2 (self-contained bundle) is unaffected; `npm run build` guard green
- `test/ci/security-overrides.test.ts` — range-aware, adds `minimatch` (#92)
- `docs/testing.md` — its `test/ci/` line now says "outside its advisory's vulnerable range"
- none — no README passage, `.vscodeignore`, workflow job, `when` clause or setting change
