# Plan: Find All References shows its results in the visual editor's detail panel

## Technical context

- `src/host/editorMenu.ts` `findReferences` runs `vscode.executeReferenceProvider` at the key, then `editor.action.showReferences` after `TokenEditorProvider.preferText`. The peek and `preferText` go; the locations are turned into `TokenReference`s and sent with `TokenEditorProvider.notify`.
- Classifying a location: look its URI up in the workspace scan's token files (`findTokenFiles`, plus the open file), never opening it, since code uses can run to hundreds of files; in a token file the location's range is the referencing token's key (`memberRange(...).selection` in `languageFeatures.ts` `provideReferences`), so `jsonc-parser`'s `getLocation` one character in gives its path. Anything else is a code use.
- Opening another token file on a token is what `tokenAtlas.revealToken` does: `openInVisualEditor(uri)` then `TokenEditorProvider.scopeTo(uri, parent, path)`.
- The webview keeps the last `references` message; `Detail` renders it when its path is the panel's token. The list is cleared when the panel's selection moves to another token. A referencing token's value is resolved by the host in its own file (`resolveAliases` with that file's external index) and sent on the entry as `value` and `type`, since a path alone cannot tell two files' same-path tokens apart; `Detail` draws it with `Glyph`. A failed `openReference` is reported with `showErrorMessage` inside its handler, so the intent queue's catch does not replace the table.

## Design decisions

1. **One message, one intent.** `HostToWebview` gains `references { path, references }`; `WebviewToHost` gains `openReference { reference }`. The webview still never touches files.
2. **The same-file click stays in the webview**, as a breadcrumb click does; only another file goes to the host.
3. **The closed-editor case reuses `editorMenu.ts`'s message** for Rename… and Delete, so the wording is one.

## File structure

```
src/shared/protocol.ts                 # TokenReference, references, openReference
src/host/editorMenu.ts                 # findReferences posts the list
src/host/tokenEditorProvider.ts        # openReference intent
src/webview/App.tsx                    # holds the list, opens the panel, routes clicks
src/webview/components/Detail.tsx      # Referenced by section
test/host/editor-references.test.ts    # the message sent, the intent handled
test/host/vscode-stub.ts               # showTextDocument
test/webview/references.test.tsx       # the section and its clicks
test/integration/editor-menu.test.ts   # no text tab opens
README.md, docs/design.md              # the section; the message and intent
```

## Surfaces touched

- `src/shared/protocol.ts` — a message and an intent, host and webview changed together; `docs/design.md`'s host-to-webview contract lists them
- a published surface (the menu command's behavior) — README visual editor section, CHANGELOG from release tooling
- `test/integration/` — the text-tab test becomes "opens no text tab"
- none — no `package.json` change, so no `when` clause, `setContext`, `.vscodeignore`, workflow job, `dependencies`/`mainFields` or setting
