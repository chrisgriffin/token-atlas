# Plan: Delete from the visual editor's right-click menu asks before removing a token or group

## Technical context

- `src/host/editorMenu.ts` `deleteNode` sends `deleteNode` straight to `TokenEditorProvider.receive`. The panel's confirmation is the webview's two-click `DeleteButton`, which a native menu cannot reuse, so the host asks with `vscode.window.showWarningMessage(..., { modal: true }, "Delete")`, the shape `deprecate.ts`'s prompts already use.
- Group or token is read from the document, not the menu argument: the row's path is looked up in `indexTokens(parseTokens(text))`; a miss walks `model.root` to the group with `findGroup`, exported from `src/host/tokenTree.ts`. A group counts the view rows the delete removes: `expandExtends` (against `externalIndexFor`) on the text before and after `computeDeleteEdits` is applied with jsonc-parser's `applyEdits`, the rows under the group counted apart from those a group extending it loses.
- A path with no key in the file sends nothing and says why: inherited through `$extends` or `$ref` (from `group.extends.via` of the deepest extending group on the path whose target, with the rest of the path under it, is a row of the view; an inner `$ref` to a group with no such row is not the one) when the view still has it, otherwise no longer in the file. A group's `<n>` is `countTokens(group)` on the file's model (its own keys, overrides of inherited rows included) plus the view rows under it that leave and are not file keys (the inherited ones). The count of rows other groups lose names the `via` of the extending group whose target is the deleted key, lies under it or above it, the one whose source went away; an inner `$ref` to some other group on the same path still holds, so it is not the one named. When `parseTokens` reports a JSON syntax error, nothing is counted: a key `computeDeleteEdits` still finds gets `Delete "<path>"?` and is sent, otherwise the menu says the file does not parse.
  _Corrected 2026-10-31 (PR #56 review, round 5): this named `$extends` alone and treated a file that does not parse as one the key had left._
  _Corrected 2026-10-31 (PR #56 review): this read "counts it with `countTokens`", which FR2's correction replaced with the view rows that leave, and left out both refusals._
- The prompt is a module-level function swapped by `setMenuDeletePrompt`, returned on `TokenAtlasTestHooks` beside `setDeletePrompt`.
- Unit test `test/host/editorMenu.test.ts` (vitest, mocked `vscode`), cases named `menu delete asks …`; `test/integration/editor-menu.test.ts`'s two Delete cases answer the prompt.

## Surfaces touched

- `src/host/editorMenu.ts` — the prompt before `deleteNode`, and `setMenuDeletePrompt`.
- `src/host/tokenTree.ts` — `findGroup` exported for the menu's group lookup.
- `src/extension.ts` — `setMenuDeletePrompt` on `TokenAtlasTestHooks` (test-only, not a public API).
- `test/host/editorMenu.test.ts` — new: confirm, cancel, group count.
- `test/integration/editor-menu.test.ts` — the Delete cases answer the prompt and pin cancel.
- `README.md` — the right-click paragraph says Delete asks first.
- `docs/design.md` and `docs/architecture.md` — the `editorMenu.ts` entries say Delete asks first.
- Published surface — none: no command, setting or export changes; the `tokenAtlas.deleteNode` command keeps its id and argument.
