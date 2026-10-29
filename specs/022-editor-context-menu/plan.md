# Plan: A right-click menu on the visual editor's tokens and groups

## Technical context

- VS Code runs a `webview/context` command with the merged
  `data-vscode-context` of the right-clicked element and its ancestors, plus
  `webview` (the view type), as its one argument
  (`webviewElement.ts`, `getActionsContext`). Context keys from it are usable
  in the entry's `when`.
- The visual editor is `src/host/tokenEditorProvider.ts` (host) and
  `src/webview/App.tsx` / `components/Table.tsx` (webview). Rename and delete
  already exist as `renameNode` / `deleteNode` intents; `TokenEditorProvider.receive`
  runs an intent through the editor's queue.
- The deprecation commands are `src/host/deprecate.ts` and
  `renameWithoutAlias` in `src/host/rename.ts`; each takes `(uri, path, …)`
  or reads the cursor.

## Design decisions

1. **The document URI rides on the table's root.** The host adds `uri` to
   the `init`/`update` state; `App` sets `data-vscode-context` `{uri}` on its
   root, and rows add `{webviewSection, path, tokenDeprecated}`. VS Code
   merges them, so no row repeats the URI.
2. **One reader of the menu argument, `rowTarget`, in `workspaceIndex.ts`.**
   It turns `{uri, path}` into a `Uri` and a path, or undefined. The
   deprecation commands call it first, so their current `(uri, path)` and
   cursor forms are unchanged. It lives in `workspaceIndex.ts` because
   `deprecate.ts` and `rename.ts` already import it, and a new module that
   imports the provider would close an import cycle through `deprecate.ts`.
3. **New commands in `src/host/editorMenu.ts`.** Copy Reference writes
   `{path}`; Find All References runs `vscode.executeReferenceProvider` at
   the key (the provider Shift+F12 uses) and shows the result as
   `findDeprecatedUses` does; Show in JSON calls `preferText` then opens the
   text beside with the key selected; Rename… and Delete send `renameNode`
   and `deleteNode` through `TokenEditorProvider.receive`, so the delete
   prompt, the rename alias and the name errors are the existing ones.
4. **Deprecated means `deprecation(token)` from core**, so a token deprecated
   through its group shows the remove items, as it is struck through.
5. **Inherited rows get their own section** with Copy Reference only.
6. **The manifest ↔ webview coupling is a test**, not a `CLAUDE.md` row:
   `test/ci/manifest-couplings.test.ts` checks every `webviewSection` a
   `webview/context` `when` names is a string the webview sets, and every
   command it names is contributed.

## File structure

```
package.json                          # five commands, palette-hidden; webview/context entries
src/shared/protocol.ts                # State.uri
src/host/tokenEditorProvider.ts       # sends uri
src/host/workspaceIndex.ts            # rowTarget
src/host/editorMenu.ts                # the five commands
src/host/deprecate.ts                 # targetOf reads rowTarget
src/host/rename.ts                    # renameWithoutAlias reads rowTarget
src/extension.ts                      # registerEditorMenu
src/webview/App.tsx                   # root context {uri}
src/webview/components/Table.tsx      # row and heading contexts
test/webview/contextMenu.test.tsx     # the contexts the webview sets
test/ci/manifest-couplings.test.ts    # sections and commands match
test/integration/editor-menu.test.ts  # each command run with a row's context
README.md, docs/design.md             # the menu; editorMenu.ts in § 2.1
```

## Surfaces touched

- `package.json` `contributes.commands` / `contributes.menus` — five commands and a `webview/context` menu; its `when` clauses read webview context keys and `config.tokenAtlas.deprecationWorkflow`, not `tokenAtlas.isTokenDocument`, so the `setContext` call in `src/extension.ts` is unchanged
- `src/shared/protocol.ts` — `State.uri`, sent by the host and read by the webview in the same change
- a published surface (extension commands and a menu) — `README.md` § Commands and the visual editor section, `docs/design.md` § 2.1, CHANGELOG from release tooling
- `test/integration/` — commands, clipboard and the references view are host behaviour vitest cannot load
- none — no `.vscodeignore` entry (no new top-level directory), no workflow job renamed (ruleset untouched), no `dependencies`/`mainFields` change (invariant 2 unaffected), no setting added, no ADR
