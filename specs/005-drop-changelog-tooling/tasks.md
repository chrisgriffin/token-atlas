# Tasks: Delete the changelog tooling the release workflow no longer uses

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Check

- [x] T001 Confirm on `develop` that the runnable line prints `0` and `4`.

## Phase 2: Remove

- [x] T002 Delete `changelog-preset.config.mjs` and its `.vscodeignore` line.
- [x] T003 `npm uninstall` the three conventional-changelog dev dependencies and drop the `version:recommend` script.

## Phase 3: Verification

- [x] T004 Runnable line prints `1` and `0`.
- [x] T005 Run the gate: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && xvfb-run -a npm run test:integration`.

## Phase 4: Surfaces

- [x] T006 Grep `docs/`, `README.md`, `test/` for the removed names — none.
- [x] T007 Fleet surfaces — confirmed none apply.
