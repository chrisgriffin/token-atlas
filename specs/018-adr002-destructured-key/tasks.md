# Tasks: ADR-002 names the destructured tokens key that rename leaves behind

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Check

- [x] T001 Confirm on `develop` that the destructured key is skipped and `tokens.borderWidth` is kept, and that the runnable line prints `0`.

## Phase 2: Doc

- [x] T002 Add the Consequences bullet to `docs/adr/ADR-002-js-style-property-names.md`.

## Phase 3: Verification

- [x] T003 Runnable line prints `1` or more.
- [x] T004 Run the gate: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && xvfb-run -a npm run test:integration`.

## Phase 4: Surfaces

- [x] T005 `docs/adr/ADR-002-js-style-property-names.md` (T002).
- [x] T006 `docs/architecture.md` — the same price in its Find References paragraph.
- [x] T007 Fleet surfaces — confirmed none apply.
