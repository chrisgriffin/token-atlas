# Tasks: Comments and docs give the reason in words instead of citing issue numbers from another tracker

Feature directory: `specs/020-inline-issue-reasons`

## Phase 1 — setup

- [x] T001 `npm ci`, then record the red baseline: the runnable grep prints `20`

## Phase 2 — rewrite

- [x] T002 `src/` — `core/serialize.ts` (2), `host/hardcodedValues.ts`, `host/legacyFix.ts`, `host/workspaceIndex.ts`, `webview/App.tsx`
- [x] T003 `test/ci/` — `configuration-defaults`, `manifest-couplings`, `readme-settings`
- [x] T004 `test/core/edits.test.ts`
- [x] T005 `test/integration/` — every file citing an old-tracker number
- [x] T006 `test/webview/` — `columnResize`, `modeColumns`, `panelResize`, `stickyHeader`, `tableReorderGating`, `toolbarChip`
- [x] T007 `docs/design.md`, `docs/adr/ADR-001-exported-identifier-matching.md`, `.vscode-test.mjs`
- [x] T008 `CLAUDE.md` invariant 2

## Phase 3 — acceptance

- [x] T009 The runnable grep prints `0`, and `git grep -nE '#[0-9]{3,}\b' -- src test docs .vscode-test.mjs CLAUDE.md` finds only hex colours
- [x] T010 `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration` is green
