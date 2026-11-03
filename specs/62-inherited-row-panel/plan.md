# Plan: The detail panel offers no Rename, Delete or Move on an inherited row

## Technical context

- `src/webview/components/shared.tsx` `NodeHeader` renders the click-to-rename name and the Move up / Move down / Delete group from three required callbacks.
- `GroupDetail.tsx` and `Detail.tsx` pass those callbacks straight through. `GroupNode.inheritedFrom` is set only on a group `expandExtends` creates to hold inherited tokens (via `$extends` or a group-level `$ref`); `TokenNode.inheritedFrom` only on an inherited token. Both are already what the right-click menu reads (#58).
- Change: the three callbacks become optional on `NodeHeader`; absent, the name is a plain heading and the action group is not rendered. Each panel omits them when its node has `inheritedFrom`. `App.tsx` is unchanged: the panels decide from the node they are given.
- Tests: `test/webview/GroupDetail.test.tsx` and `test/webview/Detail.test.tsx`, one `inherited row panel` case each, checking an inherited and an owned node.

## Surfaces touched

- `src/webview/components/shared.tsx` — `NodeHeader`'s handlers optional.
- `src/webview/components/GroupDetail.tsx`, `src/webview/components/Detail.tsx` — omit the handlers on an inherited node.
- `test/webview/GroupDetail.test.tsx`, `test/webview/Detail.test.tsx` — the `inherited row panel` cases.
- `README.md` — the right-click paragraph that names what an inherited row offers says the panel matches.
- `package.json`, `docs/design.md`, `docs/architecture.md` — unchanged: no command, intent or directory changes.
- Published surface — none.
