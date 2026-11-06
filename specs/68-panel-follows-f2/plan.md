# Plan: The Token Editor's detail panel follows a token renamed with F2 in the text editor

## Technical context

- The webview already follows a `renamed` message for the node the panel is on or inside (`src/webview/App.tsx`, #49), pinned for a token and its group in `test/webview/contextMenu.test.tsx`. Nothing changes on the webview side.
- `TokenEditorProvider.notify(uri, message)` (#55) posts to every editor open on a document; `renameWithoutAlias` already calls it after its rename applies.
- `TokenRenameProvider.provideRenameEdits` (`src/host/rename.ts`) returns its edit to VS Code, which may apply it now, after the refactor preview, or never. A new `notifyWhenApplied` works out the document text the edit makes and waits for a change that leaves the document exactly that text, then calls `notify` with the path in the document (the fragment's path plus the node's) and the new name, the same message `renameWithoutAlias` sends. It stops listening after that, or after ten minutes, as `offerWhenApplied` beside it does. The new key's presence is not the signal: renaming back onto a deprecated alias finds it already there. One F2 waits per document, each new F2 replacing the last, so a rename discarded in the preview cannot fire on a later one; a rename that changes nothing in the document waits for nothing.
- Known ceiling: if the user discards the preview and then edits the document into exactly the text the rename would have made, within ten minutes and before another F2, the panel is told of that rename, which is then what the document holds. If the user unticks some of this document's changes in the preview, the text never matches and the panel is not told, as before this change.
- Tested in vitest under `test/host/vscode-stub.ts`, grown to keep the registered rename provider, give a stub document `offsetAt` and a `WorkspaceEdit` `get`, so a test can run F2's `provideRenameEdits`, apply (or drop) the edit it returns, and see what the editor is posted. Each case is named `panel follows F2: …`. The webview's "unrelated node leaves the panel alone" case for `renamed` goes in `test/webview/contextMenu.test.tsx`, beside the matching `deleted` case.

## Surfaces touched

- `docs/design.md` § 2.1 — the `editorMenu.ts` entry names the commands that tell the open editor through `notify`; add F2 to it.
- `docs/testing.md` — the `vscode-stub.ts` description: it now also runs the registered rename provider.
- none other — no `package.json`, workflow, protocol or published-surface change: `renamed` already exists in `src/shared/protocol.ts`.
