# Spec: The Token Editor's detail panel follows a token renamed with F2 in the text editor

**Issue**: [#68](https://github.com/chrisgriffin/token-atlas/issues/68)

## Overview

With the Token Editor's detail panel open on a token, renaming that token with F2 in the JSON text editor leaves the panel blank: nothing tells the editor about the rename. The panel's own rename and the right-click menu's already tell it, so the panel follows the token (#55). F2 is the last rename path that does not. VS Code applies an F2 edit right away, after the refactor preview, or never, so the panel is told only once the edit has landed.

## User scenarios

- The detail panel is open on `color.ink`; the user presses F2 on `ink` in the text editor and types `black`: the panel stays open on `color.black`.
- The panel is open on `color.ink`; the user renames the group `color` to `paint` with F2: the panel stays open on `paint.ink`.
- The user presses F2, opens the refactor preview and discards it: the panel hears nothing.
- The panel is open on `color.ink`; the user renames `color.old` with F2: the panel stays on `color.ink`.

## Functional requirements

- FR-001: Once an F2 rename's edit has landed in the document, every Token Editor open on that document is sent `renamed` with the renamed node's path and new name.
- FR-002: An F2 rename whose edit never lands (cancelled in the refactor preview) sends nothing.
- FR-003: A `renamed` naming a node the panel is neither on nor inside leaves the panel where it is.

## Success criteria

- [x] After an F2 rename of the token or group the detail panel is on, or of a group the token is inside, the panel stays open on the renamed node. The work adds `test/host/panel-follows-f2.test.ts` to cover it. **Runnable:** `npx vitest run test/host/panel-follows-f2.test.ts` exits 0 (it exits 1 on `develop`, where that file does not exist).
- [x] An F2 rename that is cancelled in the refactor preview posts nothing to the panel.
- [x] A panel on an unrelated token is unchanged by an F2 rename.
- [x] `npm test` passes.
