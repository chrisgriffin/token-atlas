---
status: proposed
date: 2026-10-24
---

# ADR-003: A deprecated token's replacement is the first `{reference}` in its `$deprecated` reason

Implemented by [#28](https://github.com/chrisgriffin/token-atlas/issues/28).

## Context

Token Atlas reads `$deprecated` (a hover pill, a hint, a strike-through on
every use) and #28 adds the write side: mark a token deprecated, move its uses
onto what replaces it, remove it once unused. Moving a use needs to know the
replacement, and DTCG 2025.10 defines none: `$deprecated` is `true` or a
string explaining why.

Two places were on the table: a sibling `$`-field such as `$replacedBy`, or a
`{reference}` inside the `$deprecated` string. A sibling field is invented
syntax: the format reserves `$` names for itself, the parser reports any
other one as unknown, and no other tool would read it. The string is already
what every reader here (and any other DTCG tool) shows a person.

## Decision

- The replacement is the token named by the first `{reference}` in the
  `$deprecated` string, resolved as any reference is: the document first,
  then the workspace index (invariant 4). `"use {color.border.default}
instead"` names `color.border.default`.
- A string with no reference, and `true`, name no replacement: the token is
  deprecated with nothing to move to, and no quick fix is offered.
- A reference that does not resolve is a warning on that `$deprecated`,
  naming it; a use of the token is still struck through, with no fix.
- Writing a replacement swaps the reason's first reference for it, or adds
  `use {…} instead` when there is none (`deprecatedValue` in
  `src/core/serialize.ts`); a new `$deprecated` is written as the node's
  first member, so the diff is that one line.

## Consequences

- No new syntax: every existing reader, the hover, the hint and other DTCG
  tools keep working unchanged, and a person reading the JSON reads a
  sentence.
- A reason that mentions some other token in braces before the replacement
  names that token instead. The writer never produces one, and the visual
  editor's picker shows which token the string names.
- Revisit if a future DTCG version defines a successor field: read it first,
  and keep this as the fallback for files written before it.
