# Tasks: Cell controls keep their own clicks

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Tests

- [x] T001 Add the `Cell controls keep their own clicks` block to `test/webview/Table.test.tsx` with a helper that clicks a control and fails if any cell in the row took focus or an inline input is left.
- [x] T002 Swatch test: click the color input, then change it, and expect `edits.setValue` with the picked color.
- [x] T003 Alias chevron test: click the chevron and expect the alias picker dialog.
- [x] T004 Problem mark test: click the mark and expect `onOpen` with the token's path.
- [x] T005 Edit button test: click the button and expect `onOpen` with the token's path.

## Phase 2: Verification

- [x] T006 Run each new test with the control exclusion disabled and record the red run in the PR body.
- [x] T007 Add `specs/**` to `.vscodeignore`.
- [x] T008 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
