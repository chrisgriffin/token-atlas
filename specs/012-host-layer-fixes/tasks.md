# Tasks: Host layer fixes before 1.0

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Tests that fail first

- [x] T001 `test/host/vscode-stub.ts` and `test/host/workspaceIndex.test.ts`: search and read counts per event, shared scan, keystroke mid-scan, half-typed JSON, a file leaving and joining by content, one event per pause, per-folder include.
- [x] T002 `test/host/diagnostics.test.ts`: unused hints cleared on close; nothing published for a token document or stylesheet closed mid-check.
- [x] T003 `test/host/settings.test.ts`: hover and hardcoded-value root size read for the file's folder.
- [x] T004 `test/integration/index-edits.test.ts`: half-typed JSON breaks no other file, a file that stops holding tokens leaves, a discarded edit leaves on close, a renamed file stays active.
- [x] T005 `test/integration/resolver.test.ts`: an edit to the active resolver takes effect without re-picking.
- [x] T006 `test/integration/rename.test.ts` and `token-editor-writes.test.ts`: F2 refuses a leading `$`; the visual editor refuses all four kinds of bad name and says why.
- [x] T007 `test/integration/mode-columns.test.ts`: the mode-view toggle over a workspace value.
- [x] T008 `test/integration/panel.test.ts`: unknown `$type` icon, dotted-key ids, `openCurrent` with a URI.
- [x] T009 `test/integration/diagnostics-documents.test.ts`: no diagnostics on a copy under another scheme.
- [x] T010 Run every new test against the unfixed code and record the red runs.

## Phase 2: Fixes

- [x] T011 Incremental workspace index with shared scan and build, debounced event, last good text, per-folder discovery and watchers, close and delete handling.
- [x] T012 Active resolution stored as resolver and input, recomputed from the resolver's text; rename remap in `activeSet.ts`.
- [x] T013 One rename name check in `buildRenameEdit`; the visual editor shows it.
- [x] T014 Scoped settings in hover and the hardcoded-value check.
- [x] T015 Diagnostics: scheme filter, closed-document guard, unused hints cleared on close; same guard in the hardcoded-value check.
- [x] T016 Mode-view toggle written where a value already decides it.
- [x] T017 Tokens panel icon and ids; `openCurrent` takes the menu's URI.

## Phase 3: Verification

- [x] T018 Update `docs/testing.md` and `docs/architecture.md`.
- [x] T019 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
