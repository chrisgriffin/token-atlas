# Spec: The workflow stub and timeout tests also check a workflow file named .yaml

**Issue**: [#78](https://github.com/chrisgriffin/token-atlas/issues/78)

## Overview

Two test files check every workflow in `.github/workflows/`: one that each stub passes its secrets by name and never `secrets: inherit`, the other that each job caps its runtime. Both only read files ending `.yml`, but GitHub also runs `.yaml` files there, so a workflow added under that extension skipped both checks. Both now read either extension.

## User scenarios

- Someone adds `.github/workflows/probe.yaml` passing `secrets: inherit`: `npm test` fails on it, as it does for a `.yml` file.
- Someone adds a `.yaml` workflow whose steps job sets no `timeout-minutes`: `npm test` fails on it, as it does for a `.yml` file.

## Functional requirements

- FR-001: `test/ci/workflow-stub-guards.test.ts` runs its per-file checks, and its "only workflow that runs the gate" check, over every file in `.github/workflows/` ending `.yml` or `.yaml`.
- FR-002: `test/ci/workflow-timeouts.test.ts` checks every job in every file there ending `.yml` or `.yaml`.

## Success criteria

- [x] A workflow file ending `.yaml` that passes `secrets: inherit` fails the test suite, as a `.yml` one already does.
- [x] A `.yaml` workflow with a job that runs steps and sets no `timeout-minutes` fails the test suite, as a `.yml` one already does.
- [x] **Runnable:** `printf 'on: push\njobs:\n  probe:\n    uses: chrisgriffin/workflows/.github/workflows/_reusable-node-ci.yml@v1\n    secrets: inherit\n' > .github/workflows/probe.yaml; npx vitest run test/ci/workflow-stub-guards.test.ts > /dev/null 2>&1; echo "exit $?"; rm .github/workflows/probe.yaml` prints `exit 1` (it prints `exit 0` on `develop`, where the `.yaml` file is never read).

## Out of scope

- `test/ci/workflow-stubs.test.ts`: it reads named files only, never a directory listing.
