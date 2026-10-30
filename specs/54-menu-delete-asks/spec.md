# Spec: Delete from the visual editor's right-click menu asks before removing a token or group

**Issue**: [#54](https://github.com/chrisgriffin/token-atlas/issues/54)

## Overview

The visual editor's right-click menu (spec 022) has a Delete entry. The detail panel's own Delete button needs a second click before it removes anything, but the menu's Delete removes the row at once; on a group heading that is one click to remove the group and every token in it. The menu has no second click to offer, so it asks with a modal confirmation instead, then hands the delete to the editor's own intent queue as before (so the deprecation prompts `mayDelete` runs still apply after it).

## User scenarios

- Right-click a group heading → Delete: a modal asks `Delete group "<path>" and the <n> tokens in it?` with a Delete button. Cancel (or Escape) leaves the file unchanged.
- Right-click a token → Delete: a modal asks `Delete "<path>"?` with a Delete button, the menu's form of the panel's click-again confirmation.

## Functional requirements

1. `tokenAtlas.deleteNode` run with a row asks before sending `deleteNode`; nothing is sent unless the answer is Delete.
2. A group's prompt names the group and how many tokens it holds (`countTokens`); a token's names the token.
3. The prompt is replaceable from `test/integration/`, as `setDeletePrompt` and `setRemovalPrompt` are, so the suite can answer it.

## Success criteria

- [ ] Delete from the menu on a group heading removes nothing until the user confirms, and cancelling leaves the file unchanged.
- [ ] Delete from the menu on a single token asks the same way the panel's Delete does.
- [ ] **Runnable:** `npm test -- -t "menu delete asks" 2>&1 | grep "Tests:" | grep -v failed | grep -c passed` prints `1` (today `0`: no test matches).
- [ ] The build gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Needs from Chris

none
