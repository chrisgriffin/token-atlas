# Tasks

## Phase 1: Tests first

- [x] T001 Grow `test/host/vscode-stub.ts`: keep each registered rename provider, give a stub document `offsetAt`, and give `WorkspaceEdit` a `get`.
- [x] T002 Write `test/host/panel-follows-f2.test.ts`: F2 on the token, on its group, with the alias kept, cancelled, renamed back onto a kept alias and discarded, discarded before a later F2 to the same name, renamed to the same name, and naming only the renamed node, each named `panel follows F2: …`; run it red.
- [x] T003 Add the unrelated-node `renamed` case to `test/webview/contextMenu.test.tsx`.

## Phase 2: Fix

- [x] T004 `notifyWhenApplied` in `src/host/rename.ts`, called from `provideRenameEdits`.

## Phase 3: Surfaces

- [x] T005 `docs/design.md` § 2.1: F2 tells the open editor too.
- [x] T006 `docs/testing.md`: what `vscode-stub.ts` now runs.
