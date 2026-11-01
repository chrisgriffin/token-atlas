# Spec: A right-click menu on the visual editor's tokens and groups

## Overview

The visual editor has no right-click menu. The deprecation commands sit only
on the text editor's menu (`editor/context`), so someone working in the table
has to switch to JSON to deprecate, list remaining uses or remove a token.
Chris requested this on 2026-10-28.

VS Code shows a `webview/context` menu inside a webview, filtered by the
`data-vscode-context` an element carries, and passes that context to the
command it runs. The table's rows and group headings carry the token's path,
so each item acts on the row that was right-clicked.

## User scenarios

**A token row.** Right-click shows, in order:

1. **Copy Reference** — puts `{color.brand.primary}` on the clipboard.
2. **Find All References** — the references view, as Shift+F12 on the key.
3. **Show in JSON** — the file as text, beside the table, with the key selected.
4. **Rename…** — asks for the new name; the same rename the name cell does.
5. **Rename Token Without Keeping Old Name** — workflow on only.
6. **Deprecate Token…** — workflow on, token not deprecated.
7. **Find Remaining Uses of Deprecated Token** — workflow on, token deprecated.
8. **Remove Deprecated Token** — workflow on, token deprecated.
9. **Delete** — the same delete the panel does, prompts included.

**A group heading.** Show in JSON, Rename…, Rename Token Without Keeping Old
Name (workflow on), Delete.

**An inherited token** (a group's `$extends`, no key of its own). Copy
Reference only: there is no key to rename, delete, deprecate or show.

## Edge cases

- **Workflow off.** The four deprecation items are hidden, as their text
  editor entries are.
- **Deprecated through its group.** A token whose group is deprecated counts
  as deprecated, as the strike-through does (`deprecation()` in core).
- **A name taken or invalid.** Rename refuses with the message the name
  cell's rename already shows.
- **`tokenAtlas.defaultEditor` set to `visual`.** Show in JSON still opens
  text: it marks the file as text-preferred, as Open as JSON does.

## Functional requirements

1. `package.json` contributes `webview/context` entries for the visual
   editor's `webviewId`, by `webviewSection` (`token`, `inherited`, `group`).
2. Each token row, inherited row and group heading in the table sets
   `data-vscode-context` with its section and path; a token row also says
   whether it is deprecated. The table's root carries the document's URI.
3. Five new commands, hidden from the Command Palette:
   `tokenAtlas.copyReference`, `tokenAtlas.findReferences`,
   `tokenAtlas.showInJson`, `tokenAtlas.renameNode`, `tokenAtlas.deleteNode`.
   Rename and Delete go through the editor's own intent queue, so they are
   the edits the table and panels already make.
4. The four deprecation commands accept the menu's context as well as their
   current arguments.

## Success criteria

- [ ] Right-clicking a token row in the visual editor shows Copy Reference, Find All References, Show in JSON, Rename… and Delete, and each acts on that row's token.
- [ ] With `tokenAtlas.deprecationWorkflow` on, the token menu also shows the deprecation commands that apply to the row (Deprecate Token… when it is not deprecated; Find Remaining Uses and Remove Deprecated Token when it is; Rename Token Without Keeping Old Name always), and they act on that row; with it off, none of them shows.
- [ ] Right-clicking a group heading shows Show in JSON, Rename…, Delete, and Rename Token Without Keeping Old Name with the workflow on.
- [ ] Every `webviewSection` a `webview/context` entry names is one the webview sets, and every command it names is contributed, checked by `npm test`.
- [ ] README describes the menu.
- [ ] **Runnable:** `npx vitest run test/webview/contextMenu.test.tsx` passes (no such file on `develop@4ca92bf`, so it fails there), and the full gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Needs from Chris

none

## Scope notes

Not in scope: a menu on the detail panels (they have their own buttons), on
the Tokens tree view, or in the side-by-side mode cells beyond the row's own
menu; multi-select actions.
