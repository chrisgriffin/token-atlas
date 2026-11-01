# Tasks

## Phase 1: Tests first

- [x] T001 Grow `test/host/vscode-stub.ts` to load `tokenEditorProvider.ts`, `rename.ts` and `deprecate.ts` and apply a `WorkspaceEdit`.
- [x] T002 Write `test/host/panel-follows-menu.test.ts`: the three `Done means` cases, each named `panel follows menu …`; run them red.

## Phase 2: Fix

- [x] T003 Add `TokenEditorProvider.notify` and make `applyEdits` return whether it changed the file; `deleteNode` posts `deleted` only then (`src/host/tokenEditorProvider.ts`).
- [x] T004 `renameWithoutAlias` posts `renamed` after it applies (`src/host/rename.ts`).
- [x] T005 `remove` posts `deleted` after it applies (`src/host/deprecate.ts`).

## Phase 3: Surfaces

- [x] T006 `docs/design.md` § 2.1: the deprecation commands tell the open editor what they renamed or removed.
- [x] T007 `docs/testing.md`: what `vscode-stub.ts` now loads.
