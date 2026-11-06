# Implementation Plan: Adopt the shared configs from chrisgriffin/config

**Branch**: `016-adopt-shared-config` | **Spec**: [spec.md](./spec.md)

## Summary

Install `github:chrisgriffin/config#v1` with its two peers (`eslint` 9, plus `globals` for the browser globals the webview needs), point Prettier, ESLint and TypeScript at it, add `npm run lint` to the gate, fix the handful of findings the base reports, and reformat the repo once.

## Technical context

- Dev-only change: no `dependencies` entry, nothing reaches `dist/` (invariant 2 untouched; `npm run build`'s guard still runs in the gate).
- Peers: `prettier ^3` (have 3.8), `typescript >=5.0 <6.1` (have 5.9), `eslint ^9` (new, 9.39).
- Prettier: `"prettier": "@chrisgriffin/config/prettier"` in `package.json`; `.prettierrc.json` deleted. `.prettierignore` unchanged, so `CHANGELOG.md`, `.github/`, `CLAUDE.md` and the tooling trees stay unformatted as before.
- ESLint: `eslint.config.mjs` — ignores build output (`dist/`, `out/`, `.vscode-test/`) and fixture code (`examples/`, `test/integration/workspace/`), then `...base`, then browser globals on `src/webview/**` and `test/webview/**`, then `argsIgnorePattern`/`varsIgnorePattern` `^_` on TS (`Table.tsx`'s rest-sibling omit, `vscode-stub.ts`'s signature-only rest arg).
- The two `no-control-regex` findings (`src/core/fileName.ts`, `test/integration-run.mjs`) match control characters on purpose; each gets a line-scoped disable with the reason.
- TypeScript: `tsconfig.json` extends the base and keeps `module`, `moduleResolution`, `lib`, `jsx`, `allowJs`, `noEmit`, `include`. The base adds `isolatedModules`; `tsc --noEmit` is clean with it.
- Test: `test/ci/shared-config.test.ts` pins the three adoptions (red on `develop`, 4/4); `test/ci/workflow-stub-guards.test.ts` adds `npm run lint` to the gate chain it pins.

## Surfaces touched

- `package.json` / `package-lock.json` — the dependency, the `prettier` field, the `lint` script.
- `.prettierrc.json` — removed; `.vscodeignore`'s entry for it becomes `eslint.config.mjs` so the new file stays out of the `.vsix` (`test/ci/package-contents.test.ts`).
- `eslint.config.mjs`, `tsconfig.json` — new / changed config.
- `.github/workflows/build-check.yml` — `npm run lint` in the `run:` chain; the `build` job name, and so the `build / ci` required check, is unchanged.
- `test/ci/shared-config.test.ts`, `test/ci/workflow-stub-guards.test.ts` — the pins.
- Every Prettier-checked file — reformatted once in the shared style.
- `CLAUDE.md` — the Commands block and the Build gate line name `npm run lint`.
- `docs/architecture.md` — § Running it and the gate line; `docs/testing.md` — the gate list (five → six) and what `test/ci/` guards.
- Fleet surfaces: none other — no Routine, plugin, reusable workflow, published surface or ruleset change; no directory added.
