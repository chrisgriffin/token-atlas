# Spec: Dependabot minimatch update: the scheduled update job fails on every attempt since 2026-11-07

**Issue**: [#92](https://github.com/chrisgriffin/token-atlas/issues/92)

## Overview

Dependabot's security update for `minimatch` (GHSA-g3hv-75wg-m249, vulnerable `>=7.0.0 <11.0.1`) fails on every run because no parent allows the patched major: `@vscode/test-cli` and `typescript-eslint` pin `minimatch` 10, `mocha` pins 9, and `glob` 10–13 (under `mocha`, `@vscode/test-cli`, `test-exclude`, `@vscode/vsce`) pin 9–10. With no parent able to take 11, Dependabot cannot resolve the bump and the job ends in failure. The fix is the one chrisgriffin.io and chrisgriffin/workflows (workflows#53) already use: `overrides` that lift `minimatch` 7–11 to `^11.0.1` and `glob` 9–14 to `^14.0.2`. Only `glob` 14's own `minimatch` range already allows 11; the overrides force every other parent past its declared major (`mocha`, `@vscode/test-cli`, `test-exclude` and `@typescript-eslint/typescript-estree` for `minimatch`; `mocha`, `@vscode/test-cli`, `test-exclude` and `@vscode/vsce` for `glob`). Those parents still work on the forced versions: the full gate, integration suite and `vsce package` are green.

## Functional requirements

- FR-001: `package.json` `overrides` lift every `minimatch` copy in `>=7 <12` to `^11.0.1` and every `glob` copy in `>=9 <15` to `^14.0.2`; `minimatch` 3.x copies (outside the advisory) stay.
- FR-002: `test/ci/security-overrides.test.ts` fails on a lockfile holding any `minimatch` copy in `[7.0.0, 11.0.1)`.

## Success criteria

- [x] **Runnable:** `npm audit --json | jq '[.vulnerabilities | keys[] | select(. == "minimatch")] | length'` prints `0`.
- [x] The repo's test suite passes with whatever `minimatch` version `develop` then resolves.
- [ ] after-merge: the next scheduled Dependabot run for `minimatch` on token-atlas no longer ends in `failure`.

## Out of scope

- The 3 low-severity `diff` advisories under `mocha` (fix needs a `@vscode/test-cli` downgrade); not part of this issue.
