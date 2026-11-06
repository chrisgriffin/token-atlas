# Plan: The host test stub runs VS Code's built-in commands and keeps a re-registered command when the old one is disposed

## Technical context

- `test/host/vscode-stub.ts` keeps `registered`, a `Map` of id to handler; `executeCommand` throws `command '<id>' not found` for a missing id (#67), and each disposer calls `registered.delete(id)`.
- The VS Code built-ins `src/` runs today, by `grep executeCommand src`: `editor.action.showReferences` (`src/host/deprecate.ts`, `src/host/editorMenu.ts`), `vscode.executeReferenceProvider` (`editorMenu.ts`), `vscode.openWith`, `workbench.action.focusActiveEditorGroup`, `setContext`, and `tokenAtlas.tokens.focus` (`src/host/tokenTree.ts`), which VS Code generates for the contributed `tokenAtlas.tokens` view. The stub gets a `BUILT_INS` set of those ids; `executeCommand` runs a registered handler first, else resolves `undefined` for a built-in, else throws as before. `undefined` is what a fire-and-forget caller ignores, and `vscode.executeReferenceProvider`'s caller already reads it as `?? []`.
- Each registration is stored as its own object wrapping the handler, and the disposer deletes the id only when `registered.get(id)` is still that object, so a newer registration holding the same handler survives.
- Known ceiling: a built-in the host starts running later is not in `BUILT_INS` until someone adds it; a host test reaching it fails naming the id, which says exactly what to add.
- Tested in vitest: a new `test/host/vscode-stub.test.ts` beside the stub, its cases named `built-in VS Code command: …` (driving `tokenAtlas.findDeprecatedUses` to the `editor.action.showReferences` peek, and an unknown `editor.action.*` id still failing) and `re-registered command: …`.

## Surfaces touched

- `docs/testing.md` — the `vscode-stub.ts` description says running an unregistered id fails; add that the built-ins the host runs resolve.
- none other — test-only change: no `src/`, `package.json`, workflow or published surface.
