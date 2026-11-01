# Spec: An inherited group heading's right-click menu offers no Rename or Delete

**Issue**: [#58](https://github.com/chrisgriffin/token-atlas/issues/58)

## Overview

In the visual editor, a group heading that exists only because `$extends` (or a group-level `$ref`) brings it in still gets `webviewSection: "group"`, so its right-click menu offers Rename… and Delete. That group has no key of its own in the file, so neither edit has anything to act on. An inherited token already gets its own `inherited` section with Copy Reference only; an inherited group heading gets the same section.

## User scenarios

- Right-click a heading `$extends` alone gives (`dark.bg`, inherited from `light`): the menu shows Copy Reference, and no Rename… or Delete.
- Right-click a heading the file defines: the menu is unchanged — Show in JSON, Rename… and Delete.
- Right-click the parent name of an inherited heading (`dark` in `dark / bg`) when `dark` is a key in the file: that name keeps the group menu.

## Functional requirements

1. A group heading, and each name in it, whose group carries `inheritedFrom` (created by `expandExtends` only to hold inherited tokens) sets `webviewSection: "inherited"` with its path, as an inherited token row does.
2. A group heading, and each name in it, whose group is in the file keeps `webviewSection: "group"` with its path.

## Success criteria

- [x] Right-clicking a group heading that exists only through `$extends` offers neither Rename nor Delete; Copy Reference still works on it.
- [x] A group heading that exists in the file keeps Rename and Delete exactly as today.
- [x] A test whose name contains "inherited group heading" covers both cases.
- [x] **Runnable:** `npm test -- -t "inherited group heading" 2>&1 | grep -cE "Tests +[0-9]+ passed"` prints `1` (prints `0` on `develop` today: no test matches, vitest reports every test skipped).
- [x] `npm run lint`, `npm run typecheck` and `npm test` all exit 0.

## Needs from Chris

none
