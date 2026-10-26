---
status: proposed
date: 2026-10-24
---

# ADR-002: In JS/TS, a DOM style property name counts as a token only when the file imports it

Implemented by [#16](https://github.com/chrisgriffin/token-atlas/issues/16).

## Context

[ADR-001](./ADR-001-exported-identifier-matching.md) matches every
identifier in exported code by normalized name. In a stylesheet only a
variable (`--x`, `$x`, `@x`) can name a token, which #14 enforced. JS/TS has
no sigil: a `border.width` token exports as `borderWidth`, and so is the DOM
style property in `el.style.borderWidth` or a style object's `borderWidth`
key. Rename rewrote both, breaking the code it touched.

Two signals were on the table: only count identifiers reached through an
import of a tokens module, or prompt before renaming a match that is also a
CSS property name. Import provenance alone would drop every token used off a
local or passed-in object; a prompt cannot run inside Find References or the
unused-token hint, which share the same scan.

## Decision

`core/exportNames.ts` `scanIdentifiers` skips, in a JS/TS file, a name whose
last dotted part is a CSS property in its DOM spelling (`STYLE_PROPERTIES`)
unless the name's root is imported into the file (`import`, `require`) or the
name is that file's own `export const`/`let`/`var` (`export declare const` in
a `.d.ts` too). A bare object key (`{ borderWidth: … }`,
`style={{ borderWidth: … }}`) is skipped even when the file imports that name:
the key is the style property, and only the value after it can be the token.
A shorthand key (`{ borderWidth }`) has no `:` after it and is not skipped, see
Consequences.
A one-word property at the end of a path other than `.style.`
(`tokens.border.width`) is a path segment and still counts. Any other name is
matched as before.

## Consequences

- Rename, Find References and the unused-token hint all read the scan, so
  they agree: none of them touches `el.style.borderWidth`.
- A style-shaped name read off an object the file did not import
  (`props.borderWidth`, `theme.borderWidth` from a parameter) is missed.
  Revisit with a setting if a real workspace hits it.
- A tokens module that exports an object
  (`export const tokens = { borderWidth: '1px' }`) loses that key from the
  scan, while an importer's `tokens.borderWidth` is still renamed: after F2
  the module and its callers disagree. Nothing in the text tells that key from
  a style object's, so it is skipped with them. Before this record both were
  renamed together.
- A key destructured with a new name from an imported tokens object
  (`const { borderWidth: bw } = tokens`) is a bare key with a `:` after it,
  so it is skipped too, while `tokens.borderWidth` in the same file is still
  renamed: after F2 the two disagree, and whichever no longer matches the
  module's key reads `undefined`, with no warning (`tokens.borderSize` on a
  hand-written module, whose key is skipped as above; `bw` once the module
  is regenerated with the new name). Before this record rename updated both.
  It is the same price as the tokens-module key above.
- A shorthand style key fed by an imported token (`style={{ borderWidth }}`
  with `import { borderWidth }`) is the key and the value in one word, so it
  still counts, and F2 rewrites it to `style={{ borderSize }}`: the style
  silently stops applying. Expanding it to `borderWidth: borderSize` would
  need the scan to tell an object literal from `import { borderWidth }` and a
  destructuring pattern, which both keep the bare form; that is left until a
  real workspace hits it.
- The property list is hand-kept. A property missing from it behaves as
  every name did before this record: rename may rewrite it.
- Hover and go-to-definition on the word under the cursor do not use the
  scan, so they still name the token on `el.style.borderWidth`.
