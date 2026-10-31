# Spec: Delete from the visual editor's right-click menu asks before removing a token or group

**Issue**: [#54](https://github.com/chrisgriffin/token-atlas/issues/54)

## Overview

The visual editor's right-click menu (spec 022) has a Delete entry. The detail panel's own Delete button needs a second click before it removes anything, but the menu's Delete removes the row at once; on a group heading that is one click to remove the group and every token in it. The menu has no second click to offer, so it asks with a modal confirmation instead, then hands the delete to the editor's own intent queue as before (so the deprecation prompts `mayDelete` runs still apply after it).

## User scenarios

- Right-click a group heading → Delete: a modal asks `Delete group "<path>" and the <n> tokens in it?` with a Delete button, where `<n>` is the group's own token keys in the file plus the inherited rows that leave the view with it, adding how many more rows leave the view when a group extending it inherits them. Cancel (or Escape) leaves the file unchanged.
- Right-click a token → Delete: a modal asks `Delete "<path>"?` with a Delete button, the menu's form of the panel's click-again confirmation.

## Functional requirements

1. `tokenAtlas.deleteNode` run with a row asks before sending `deleteNode`; nothing is sent unless the answer is Delete.
2. A group's prompt names the group and how many tokens the delete takes: the group's own token keys in the file, overrides of inherited rows included (the view keeps such a row, the override's value goes), plus the `$extends`-inherited rows that leave the view with it, and, named apart, those a group extending it in this file loses (a group in another file that extends it is not counted); a token's names the token. A row with no key in the file sends nothing and says why: inherited through `$extends` or a group-level `$ref` (the message names the one at work), or no longer in the file. In a file that does not parse there is no model to count from: a key the delete still finds gets the token's prompt and is sent as before, and one it does not find is refused, saying the file does not parse.
   _Corrected 2026-10-31 (PR #56 review, after round 5): this counted view rows alone, so an own key overriding an inherited row was left out though its value is lost; the count is now the file's own keys plus the inherited rows that leave._
   _Corrected 2026-10-31 (PR #56 review, round 5): the refusals named `$extends` alone, though a group-level `$ref` inherits the same way (`src/core/extends.ts`), and a parse error was reported as "no longer in the file" while the key was still there, blocking a delete that worked before this PR._
   _Corrected 2026-10-31 (PR #56 review): this read "how many tokens it holds (`countTokens`)", which undercounts what a delete removes from the view when `$extends` is in play (`dark` extending `light` loses rows when `light` goes), and said nothing of inherited headings, which have no key to delete._
3. The prompt is replaceable from `test/integration/`, as `setDeletePrompt` and `setRemovalPrompt` are, so the suite can answer it.

## Success criteria

- [x] Delete from the menu on a group heading removes nothing until the user confirms, and cancelling leaves the file unchanged.
- [x] Delete from the menu on a single token asks the same way the panel's Delete does.
- [x] **Runnable:** `npm test -- -t "menu delete asks" 2>&1 | grep -cE "Tests +[0-9]+ passed"` prints `1` (today `0`: vitest reports `Tests  948 skipped (948)`, so no test matches).
- [x] The build gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Needs from Chris

none
