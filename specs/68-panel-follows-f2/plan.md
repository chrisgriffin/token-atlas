# Plan: The Token Editor's detail panel follows a token renamed with F2 in the text editor

## Technical context

- The webview already follows a `renamed` message for the node the panel is on or inside (`src/webview/App.tsx`, #49), pinned for a token and its group in `test/webview/contextMenu.test.tsx`. Nothing changes on the webview side.
- `TokenEditorProvider.notify(uri, message)` (#55) posts to every editor open on a document; `renameWithoutAlias` already calls it after its rename applies.
- `TokenRenameProvider.provideRenameEdits` (`src/host/rename.ts`) returns its edit to VS Code, which may apply it now, after the refactor preview, or never. A new `notifyWhenApplied` waits for a change to the document in which the renamed node exists under its new name, then calls `notify` with the path in the document (the fragment's path plus the node's) and the new name, the same message `renameWithoutAlias` sends. It stops listening after that, or after ten minutes, as `offerWhenApplied` beside it does. The new key cannot exist before the rename (it would be `NameTakenError`), so its appearance is the signal the edit landed, with or without a kept alias.
- Known ceiling: if the user cancels the preview and then types the new name in by hand within ten minutes, the panel is told of a rename; that only moves the panel to a node that really exists under that name, the same ceiling `offerWhenApplied` accepts.
- Tested in vitest under `test/host/vscode-stub.ts`, grown to keep the registered rename provider and give a stub document `offsetAt`, so a test can run F2's `provideRenameEdits`, apply (or drop) the edit it returns, and see what the editor is posted. Each case is named `panel follows F2: …`. The webview's "unrelated node leaves the panel alone" case for `renamed` goes in `test/webview/contextMenu.test.tsx`, beside the matching `deleted` case.

## Surfaces touched

- `docs/design.md` § 2.1 — the `editorMenu.ts` entry names the commands that tell the open editor through `notify`; add F2 to it.
- `docs/testing.md` — the `vscode-stub.ts` description: it now also runs the registered rename provider.
- none other — no `package.json`, workflow, protocol or published-surface change: `renamed` already exists in `src/shared/protocol.ts`.
