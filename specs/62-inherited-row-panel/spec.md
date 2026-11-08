# Spec: The detail panel offers no Rename, Delete or Move on an inherited row

**Issue**: [#62](https://github.com/chrisgriffin/token-atlas/issues/62)

## Overview

In the visual editor, the detail panel of a group heading that exists only because `$extends` (or a group-level `$ref`) brings it in, and the panel of an inherited token, still offer Rename (click the name), Move up, Move down and Delete. Those rows have no key of their own in the file, so the edits have nothing to act on. #58 removed the same offers from the right-click menu; the panel now matches it.

## User scenarios

- Open the panel of a heading `$extends` alone gives (`dark.bg`, inherited from `light`): its name is plain text, and there are no Move up, Move down or Delete buttons.
- Open the panel of an inherited token: the same — it already shows the inherited pill, and now offers none of the three edits.
- Open the panel of a group or token the file defines: unchanged — click the name to rename, move up/down and delete.

## Functional requirements

1. `NodeHeader` takes its rename, move and delete handlers as optional; without them it renders the name as plain text and no action buttons.
2. `GroupDetail` passes none of the three when the group carries `inheritedFrom`; `Detail` passes none when the token carries `inheritedFrom`.
3. A row with its own key passes all three, as today.

## Success criteria

- [x] The detail panel of a group heading that only `$extends` or a group-level `$ref` gives offers no Rename, Delete or Move.
- [x] The detail panel of an inherited token offers no Rename, Delete or Move.
- [x] A group or token that has its own key in the file keeps Rename, Delete and Move in its panel exactly as today, and a test whose name contains "inherited row panel" covers both cases.
- [x] **Runnable:** `npm test -- -t "inherited row panel" 2>&1 | grep -cE "Tests +[0-9]+ passed"` prints `1` (prints `0` on `develop` today: no test matches, vitest reports every test skipped).
- [x] `npm run lint`, `npm run typecheck` and `npm test` all exit 0.

## Out of scope

- Whether Description, Type and Deprecated should be read-only on an inherited row (the issue's hint; not this ticket).
