# Tasks

## Phase 1: Red

- [ ] T001 `test/host/editor-references.test.ts`: the command posts `references` with token and code entries and opens no peek; `openReference` opens another token file on its token and a code file at the use; a closed editor gets the message.
- [ ] T002 `test/webview/references.test.tsx`: `references` opens the panel with both groups and the empty state; a same-file click selects the token; another click posts `openReference`.
- [ ] T003 Both fail on `develop`.

## Phase 2: Build

- [ ] T004 `src/shared/protocol.ts`: `TokenReference`, `references`, `openReference`.
- [ ] T005 `src/host/editorMenu.ts`: classify and post; drop the peek and `preferText`.
- [ ] T006 `src/host/tokenEditorProvider.ts`: handle `openReference`.
- [ ] T007 `src/webview/App.tsx`, `components/Detail.tsx`: the section and its clicks.
- [ ] T008 `test/integration/editor-menu.test.ts`: no text tab opens under the visual editor.

## Phase 3: Docs and green

- [ ] T009 README visual editor section; `docs/design.md` message and intent lists.
- [ ] T010 Full gate green.
