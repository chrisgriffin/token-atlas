# Spec: Carry out a token deprecation — mark it, move its uses, remove it once unused

## Overview

Token Atlas already **reads** `$deprecated`: `deprecation()` in
`src/core/validate.ts` resolves a token's own flag or its nearest group's,
`deprecationMessage()` renders the hint, and `deprecatedReferences()` finds
every alias whose direct target is deprecated. The host turns that into a
hover pill, a diagnostic, and a strike-through on uses in token files and in
CSS, Sass and JS.

What is missing is the other half: **carrying the deprecation out.** Today a
person can see that a token is deprecated but has to do every subsequent step
by hand — edit the flag in, find each use, retype the replacement, and decide
by eye whether anything still points at the old token before deleting it.

DTCG 2025.10 allows `$deprecated` to be `true` or a string explaining why, and
defines **no successor field**. So where the replacement is recorded is this
spec's first decision, not something the format settles.

## Decision: where the replacement is recorded

`$deprecated` is a string containing a `{reference}` to the replacement token.

- It stays inside the format. A sibling key such as `$replacedBy` would be an
  invented `$`-field, which invariant 3's resolver rules and the DTCG
  `unknown-dollar-field` check both treat as a smell.
- It is already the field every reader in the codebase looks at, so the hover
  pill, the diagnostic and the strike-through keep working unchanged.
- A human reading the raw JSON still gets a sentence, not a machine code.

The replacement is **the first `{…}` reference in the string**, resolved the
same way any other reference is. A string with no reference is an ordinary
deprecation with no replacement — still valid, and the quick fix in criterion
3 simply does not offer itself.

Reason strings are authored as, for example:

```json
"$deprecated": "use {color.border.default} instead"
```

## User scenarios

**Deprecating a token.** A person in a token file puts the cursor on
`color.border.subtle`, deprecates it, types a reason and picks
`color.border.default` as the replacement. The file gains one
`"$deprecated"` line; nothing else in the file moves.

**Moving a use.** Elsewhere, `button.border` aliases
`{color.border.subtle}`. It is struck through already; now it offers a quick
fix that rewrites the alias to `{color.border.default}`.

**Finding what is left.** Before deleting the old token, the person asks for
every remaining use and gets one list across the workspace, not one squiggle
at a time.

**Deleting it.** With uses remaining, removal says how many and asks first.
With none, it just goes.

## Functional requirements

1. Deprecating a token is available from the text editor and from the visual
   editor, takes a reason and an optional replacement token, and writes
   `$deprecated` as a string carrying the replacement as a `{reference}`.
2. The write is a minimal, format-preserving edit through
   `src/core/serialize.ts` → a ranged `WorkspaceEdit`, like every other
   Token Atlas edit. Invariant 1 is not negotiable here.
3. Reading the replacement out of a `$deprecated` string is a pure `core`
   function. No `vscode` import, no DOM.
4. A use of a deprecated token that has a replacement offers a quick fix
   that switches that use to the replacement. This covers aliases in token
   files and exported names in stylesheets and code, which is the same set
   `deprecatedReferences()` and `src/host/codeUsages.ts` already find.
5. Every remaining use of a deprecated token across the workspace is
   listable in one place, built from the workspace index rather than from
   open editors, so an unopened file is not missed.
6. Removing a deprecated token that still has uses warns first and names how
   many remain. Removing one with no uses proceeds silently.
7. A token whose `$deprecated` names a replacement that does not resolve is
   reported by name. It is not a crash and it is not silence.

## Success criteria

- [ ] **Runnable:** `npx vitest run test/core/deprecated.test.ts -t "replacement" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed"`
      exits 0. Today it exits 1: the file's seven tests are all filtered out,
      the summary reads `Tests  7 skipped (7)`, and nothing passed. **Note
      the `grep`, which is load-bearing** — `vitest run -t <pattern>` with no
      match *skips* every test and still exits **0**, so the bare command is
      green today and asserts nothing.
- [ ] From a token in the text editor, and from a token in the visual editor,
      a person can deprecate it with a reason and a replacement, and the
      resulting file differs from the original by the `$deprecated` line
      alone.
- [ ] A use of a deprecated token that has a resolvable replacement offers a
      quick fix that rewrites the use to the replacement, for an alias in a
      token file and for an exported name in a stylesheet and in code.
- [ ] Asking for a deprecated token's remaining uses lists every one in the
      workspace, including uses in files no editor has opened.
- [ ] Removing a deprecated token with remaining uses states the count before
      it happens; removing one with no uses does not prompt.
- [ ] `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`
      is green.

## Needs from Chris

none

## Scope notes

**Not in scope.** Deprecating a whole group in one action (the reader already
inherits a group's flag, so the writer can follow later); bulk-moving every
use in one command — criterion 3's quick fix is per-use on purpose, because a
replacement is not always value-identical and a silent sweep across a
workspace is the kind of write this product exists not to make.

**Layering.** The `$deprecated` string parse and the replacement resolution
are `core`. The quick fix, the workspace list and the removal guard are
`host`. The visual editor sends an intent over `src/shared/protocol.ts` and
applies nothing itself. The boundary is not crossed.

**Where this is tested.** `core` behaviour in `test/core/deprecated.test.ts`,
which exists and has eight `deprecatedReferences` cases to sit beside. Anything
about a code action, a tree view or a command belongs in
`test/integration/`, because vitest cannot load `vscode`.
