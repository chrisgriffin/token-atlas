# Tasks

## Phase 1: Tests first

- [ ] T001 Grow `test/host/vscode-stub.ts` to load `tokenEditorProvider.ts`, `rename.ts` and `deprecate.ts` and apply a `WorkspaceEdit`.
- [ ] T002 Write `test/host/panel-follows-menu.test.ts`: the three `Done means` cases, each named `panel follows menu …`; run them red.

## Phase 2: Fix

- [ ] T003 Add `TokenEditorProvider.notify` and make `applyEdits` return whether it changed the file; `deleteNode` posts `deleted` only then (`src/host/tokenEditorProvider.ts`).
- [ ] T004 `renameWithoutAlias` posts `renamed` after it applies (`src/host/rename.ts`).
- [ ] T005 `remove` posts `deleted` after it applies (`src/host/deprecate.ts`).

## Phase 3: Surfaces

- [ ] T006 `docs/design.md` § 2.1: the deprecation commands tell the open editor what they renamed or removed.
- [ ] T007 `docs/testing.md`: what `vscode-stub.ts` now loads.
