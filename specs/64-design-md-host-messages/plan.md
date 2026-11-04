# Plan: design.md's message contract lists the renamed and deleted messages the host sends the webview

## Technical context

- `src/shared/protocol.ts` `HostToWebview`: `init`/`update` (`State`), `error`, `scope`, `renamed { path, newName }`, `deleted { path }`. `State` is `uri, model, validation, externalTokens, settings, scope, selected?, columnWidths, modes?`.
- `renamed` is posted by `src/host/tokenEditorProvider.ts` after a `renameNode` intent and by `src/host/rename.ts` after the `tokenAtlas.renameWithoutAlias` command (from the text editor or a row's menu; an F2 rename sends nothing); `deleted` by `tokenEditorProvider.ts` after a `deleteNode` intent and by `src/host/deprecate.ts` after the `tokenAtlas.removeDeprecatedToken` command (from either editor). `src/webview/App.tsx` moves the open detail panel to the new name, or closes it, when the panel's node is the path or inside it.
- Change: two bullets added to § 6's **Host → webview** list; `uri` added to the payload line with one sentence on what it is.

## Surfaces touched

- `docs/design.md` § 6 — the two bullets and the payload field.
- `src/**`, `package.json`, `README.md`, `docs/architecture.md` — unchanged: no code, command, intent or directory changes.
- Published surface — none.
