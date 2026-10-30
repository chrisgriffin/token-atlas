# Plan: Delete from the visual editor's right-click menu asks before removing a token or group

## Technical context

- `src/host/editorMenu.ts` `deleteNode` sends `deleteNode` straight to `TokenEditorProvider.receive`. The panel's confirmation is the webview's two-click `DeleteButton`, which a native menu cannot reuse, so the host asks with `vscode.window.showWarningMessage(..., { modal: true }, "Delete")`, the shape `deprecate.ts`'s prompts already use.
- Group or token is read from the document, not the menu argument: the row's path is looked up in `indexTokens(parseTokens(text))`; a miss walks `model.root` to the group and counts it with `countTokens`.
- The prompt is a module-level function swapped by `setMenuDeletePrompt`, returned on `TokenAtlasTestHooks` beside `setDeletePrompt`.
- Unit test `test/host/editorMenu.test.ts` (vitest, mocked `vscode`), cases named `menu delete asks …`; `test/integration/editor-menu.test.ts`'s two Delete cases answer the prompt.

## Surfaces touched

- `src/host/editorMenu.ts` — the prompt before `deleteNode`, and `setMenuDeletePrompt`.
- `src/extension.ts` — `setMenuDeletePrompt` on `TokenAtlasTestHooks` (test-only, not a public API).
- `test/host/editorMenu.test.ts` — new: confirm, cancel, group count.
- `test/integration/editor-menu.test.ts` — the Delete cases answer the prompt and pin cancel.
- `README.md` — the right-click paragraph says Delete asks first.
- `docs/design.md` and `docs/architecture.md` — the `editorMenu.ts` entries say Delete asks first.
- Published surface — none: no command, setting or export changes; the `tokenAtlas.deleteNode` command keeps its id and argument.
