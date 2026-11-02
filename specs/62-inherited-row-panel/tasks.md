# Tasks

## Tests first

- [ ] T001 `test/webview/GroupDetail.test.tsx`: an `inherited row panel` case — an inherited group's panel has no rename button, Move up, Move down or Delete; an owned group's has all four.
- [ ] T002 `test/webview/Detail.test.tsx`: the same for an inherited and an owned token.

## Code

- [ ] T003 `src/webview/components/shared.tsx`: `NodeHeader`'s `onRename`, `onMove`, `onDelete` optional; absent, plain name and no action group.
- [ ] T004 `GroupDetail.tsx`, `Detail.tsx`: omit the three on a node with `inheritedFrom`.

## Surfaces

- [ ] T005 `README.md`: say the inherited row's panel offers none of the three either.
- [ ] T006 Published surface: none changed; say so in the PR body.
