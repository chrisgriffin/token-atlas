# Plan: An inherited group heading's right-click menu offers no Rename or Delete

## Technical context

- `src/webview/components/Table.tsx` sets `data-vscode-context` on each section heading's `<th>` (the innermost group) and on each name `<button>` in it (that name's group). Both read `webviewSection: "group"` today, whatever the group's origin.
- `expandExtends` (`src/core/extends.ts` `holder`) marks a group it creates only to hold inherited tokens with `inheritedFrom`; a group the file defines never has it. The table already looks groups up with `findGroup` (`src/webview/lib/groups.ts`).
- A shared `headingContext(path)` in `Table.tsx` returns `{ webviewSection: "inherited", path }` when `findGroup(root, path)?.inheritedFrom` is set and `{ webviewSection: "group", path }` otherwise. The `inherited` section's `when` clauses in `package.json` already offer Copy Reference only, so no manifest change is needed.
- Test: `test/webview/contextMenu.test.tsx`, a case named `an inherited group heading …` with a fixture group whose subgroup `$extends` alone supplies, and an owned heading checked in the same case.

## Surfaces touched

- `src/webview/components/Table.tsx` — the heading and name contexts read the group's origin.
- `test/webview/contextMenu.test.tsx` — the `inherited group heading` case.
- `README.md` — the right-click paragraph says an inherited heading offers Copy Reference only.
- `docs/design.md` — the `editorMenu.ts` entry, if it names what an inherited heading offers.
- `package.json` `webview/context` — unchanged: `inherited` is already a section it names (`test/ci/manifest-couplings.test.ts`).
- Published surface — none: no command, setting or export changes.
