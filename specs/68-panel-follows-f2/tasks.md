# Tasks

## Phase 1: Tests first

- [ ] T001 Grow `test/host/vscode-stub.ts`: keep each registered rename provider, and give a stub document `offsetAt`.
- [ ] T002 Write `test/host/panel-follows-f2.test.ts`: F2 on the token, on its group, with the alias kept, cancelled, and naming only the renamed node, each named `panel follows F2: …`; run it red.
- [ ] T003 Add the unrelated-node `renamed` case to `test/webview/contextMenu.test.tsx`.

## Phase 2: Fix

- [ ] T004 `notifyWhenApplied` in `src/host/rename.ts`, called from `provideRenameEdits`.

## Phase 3: Surfaces

- [ ] T005 `docs/design.md` § 2.1: F2 tells the open editor too.
- [ ] T006 `docs/testing.md`: what `vscode-stub.ts` now runs.
