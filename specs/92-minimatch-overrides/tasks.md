# Tasks

## Phase 1: Red

- [x] T001 `test/ci/security-overrides.test.ts`: check each pinned package against its vulnerable range and add `minimatch` `[7.0.0, 11.0.1)` (#92); it fails on `develop`'s lockfile.

## Phase 2: Fix

- [x] T002 `package.json`: add `overrides` `"minimatch@>=7 <12": "^11.0.1"` and `"glob@>=9 <15": "^14.0.2"`; regenerate `package-lock.json`.
- [x] T003 `docs/testing.md`: the `test/ci/` line describes the range check.

## Phase 3: Green

- [x] T004 Runnable line prints `0`; full gate green including `test:integration` and `npm run package`.
- [ ] T005 (after merge) The next scheduled Dependabot `minimatch` run on token-atlas does not end in `failure`.
