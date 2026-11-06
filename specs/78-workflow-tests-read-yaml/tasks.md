# Tasks

## Phase 1: Red

- [x] T001 Run the runnable line on `develop`: it prints `exit 0`.

## Phase 2: Fix

- [x] T002 `test/ci/workflow-stub-guards.test.ts`: read `.yml` and `.yaml` in the per-file loop and the one-gate check; `wf` accepts a file name with either extension.
- [x] T003 `test/ci/workflow-timeouts.test.ts`: `FILES` reads `.yml` and `.yaml`.

## Phase 3: Green

- [x] T004 Runnable line prints `exit 1`; a `.yaml` steps job with no `timeout-minutes` fails `workflow-timeouts.test.ts`; `npm test` green with neither probe present.
