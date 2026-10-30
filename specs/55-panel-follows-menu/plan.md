# Plan: The detail panel follows every right-click menu edit, and closes only when the node is really gone

## Technical context

- The webview already handles `renamed` and `deleted` (`src/webview/App.tsx`, #49): it follows a renamed node and closes on a deleted one when the panel is on it or inside it. Nothing changes on the webview side.
- `TokenEditorProvider` keeps its live panels by document. A new static `notify(uri, message)` posts a message to each of them, so a command outside the intent queue can tell the editor what it did.
- `renameWithoutAlias` (`src/host/rename.ts`) and `remove` (`src/host/deprecate.ts`) call `notify` once their edit applied, with the path in the document (the fragment's path plus the token's; `[]` for a token file).
- `applyEdits` returns whether it changed the file (`false` for no edits, or when `workspace.applyEdit` refused); `deleteNode` posts `deleted` only on `true`.
- Tested in vitest under `test/host/vscode-stub.ts`, grown just enough to load the editor provider and the two commands and apply a `WorkspaceEdit` to a stub document: the three cases share the name `panel follows menu`. The webview's reaction to the messages is already pinned in `test/webview/contextMenu.test.tsx`.

## Surfaces touched

- `docs/design.md` § 2.1 — the `editorMenu.ts` entry says rename and delete go through the intent queue; add that the two deprecation commands tell the open editor what they renamed or removed.
- `docs/testing.md` — `vscode-stub.ts` is described as big enough for the index, diagnostics and hover; it now also loads the editor provider and the rename/deprecation commands.
- none other — no `package.json`, workflow, protocol or published-surface change: `renamed`/`deleted` already exist in `src/shared/protocol.ts`.
