# Tasks: A right-click menu on the visual editor's tokens and groups

Feature directory: `specs/022-editor-context-menu`

## Phase 1 — setup

- [x] T001 `npm ci`, then record the red baseline: `npx vitest run test/webview/contextMenu.test.tsx` fails (no test file)

## Phase 2 — webview

- [x] T002 `test/webview/contextMenu.test.tsx`, red first: a token row's context names `token`, its path and whether it is deprecated (directly or through its group); an inherited row is `inherited`; each group heading segment is `group` with its own path; the app root carries the URI
- [x] T003 `State.uri` in `src/shared/protocol.ts`, sent by `tokenEditorProvider.ts`; `App.tsx` sets the root context; `Table.tsx` sets row and heading contexts

## Phase 3 — host

- [x] T004 `rowTarget` in `src/host/workspaceIndex.ts`; `targetOf` in `deprecate.ts` and `renameWithoutAlias` in `rename.ts` read it
- [x] T005 `src/host/editorMenu.ts`: Copy Reference, Find All References, Show in JSON, Rename…, Delete; registered in `src/extension.ts`
- [x] T006 `package.json`: the five commands, hidden from the palette, and the `webview/context` entries per section and workflow state
- [x] T007 `test/ci/manifest-couplings.test.ts`: every `webview/context` section is one the webview sets, and every command is contributed

## Phase 4 — acceptance

- [x] T008 `test/integration/editor-menu.test.ts`: each command run with a row's context the way the menu passes it, including the four deprecation commands with the workflow on
- [x] T009 `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration` is green, and the runnable line passes

## Phase 5 — surfaces

- [x] T010 `README.md` — the menu, in the visual editor section and the commands section
- [x] T011 `docs/design.md` § 2.1 and `docs/architecture.md` — `editorMenu.ts`
- [x] T012 PR body: CHANGELOG from release tooling; no `.vscodeignore`, ruleset or `dependencies`/`mainFields` change owed
