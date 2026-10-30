# Spec: The detail panel follows every right-click menu edit, and closes only when the node is really gone

**Issue**: [#55](https://github.com/chrisgriffin/token-atlas/issues/55)

## Overview

When a token is renamed or deleted from the visual editor's right-click menu, the host tells the webview (`renamed` / `deleted`) so an open detail panel follows the token or closes (#49). Two menu entries, Rename Token Without Keeping Old Name and Remove Deprecated Token, apply their edits outside the editor's intent queue and say nothing, so the panel goes blank. And the menu's Delete says `deleted` even when nothing was deleted, so the panel can close on a token that is still there. The panel should always show what is in the file.

## User scenarios

- With the deprecation workflow on and a token's detail panel open, the user right-clicks that token, picks Rename Token Without Keeping Old Name and gives a new name: the panel shows the token under its new name.
- With a deprecated token's detail panel open, the user right-clicks it and picks Remove Deprecated Token: the panel closes.
- A delete that changes nothing in the file (no edits to make, or VS Code refuses the edit) leaves the panel open on the token.

## Functional requirements

- FR-001: After Rename Token Without Keeping Old Name applies, every Token Atlas editor open on that document is sent `renamed` with the renamed path and new name.
- FR-002: After Remove Deprecated Token applies, every Token Atlas editor open on that document is sent `deleted` with the removed path.
- FR-003: The editor's own delete sends `deleted` only when its edit changed the file.
- FR-004: A rename or remove that does not apply sends nothing.

## Success criteria

- [ ] After Rename Token Without Keeping Old Name from the menu, an open panel on that token shows the token under its new name.
- [ ] After Remove Deprecated Token from the menu, an open panel on that token closes.
- [ ] A delete that changes nothing in the file leaves the panel open on the node.
- [ ] **Runnable:** `npm test -- -t "panel follows menu" 2>&1 | grep -cE "Tests +[0-9]+ passed"` prints `1` (today `0`: vitest reports `Tests  948 skipped (948)`, so no test matches).
- [ ] The build gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Needs from Chris

none
