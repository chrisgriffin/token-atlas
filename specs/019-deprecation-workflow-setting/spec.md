# Spec: Put the deprecation workflow behind `tokenAtlas.deprecationWorkflow`, and wire rename into it

## Overview

Spec 015 shipped the deprecation tools — `Deprecate Token…`,
`Find Remaining Uses of Deprecated Token`, `Remove Deprecated Token` and the
quick fix that moves a use to its replacement — always on, and left rename
untouched. Two things were agreed on its PR thread and not built (#36):

- The workflow is a setting, **off by default**, because not every project
  wants it.
- Renaming a token can break whatever still uses its old name. With the
  workflow on, a rename keeps the old name as a deprecated alias of the new
  one instead of removing it.

**What the setting gates.** The write side of the workflow: the three
commands, the replacement quick fix, rename keeping an alias, the escape-hatch
command, the post-rename notification and the delete prompt. **What it does
not gate.** Reading `$deprecated`, which predates spec 015 and is part of
DTCG: the hover pill, the strike-through and its validation, and the visual
editor's own Deprecated field, which edits that property like any other. The
removal guard on a token that is already deprecated also stays, because it
only ever fires on a token someone deprecated.

## User scenarios

**Off (the default).** Nothing changes from today's `develop`: F2 and the
visual editor rename the key and every reference, and the old name is gone.
The deprecation commands are not offered.

**Renaming with the workflow on.** A person renames `color.border.subtle` to
`color.border.muted`. Every `{reference}` and every code use moves to
`color.border.muted`, as before, and `color.border.subtle` stays in the file
as `{ "$value": "{color.border.muted}", "$deprecated": "Renamed; use {color.border.muted} instead" }`.
Anything outside the workspace that still says `subtle` keeps working, struck
through. A notification says so and offers **Remove alias**.

**Not wanting the alias this once.** `Rename Token Without Keeping Old Name`
renames the way the setting being off does. The setting itself is the third
way out.

**Deleting a token that is still used.** The visual editor's delete asks
`"x" still has N uses. Deprecate it instead?` with **Deprecate instead /
Delete anyway / Cancel**.

## Edge cases

- **Group rename.** The old group stays, holding one deprecated alias per
  token, each pointing at the same token in the new group.
- **`a → b → c`.** Renaming `b` to `c` moves `a` to point straight at `c`:
  its `$value` and its replacement. No alias ever points at another alias.
- **Renaming back onto the alias.** `a → b` then `b → a` is not a name
  collision: the real token takes `a` back and `b` becomes the alias.
- **A replacement that is itself deprecated.** An alias, or a `$deprecated`
  reason retargeted by the rename, names the end of the replacement chain,
  never a token that is itself deprecated in favour of another.
- **Per-file brand renames.** A file that defines the renamed path itself is
  left alone (invariant 4); only the renamed file gains the alias.
- **Generated files.** A file that says it was generated is still skipped,
  and its use of the old name keeps resolving through the alias.

## Functional requirements

1. `tokenAtlas.deprecationWorkflow` is a boolean setting, default `false`.
2. With it off, rename produces exactly the edits it does on `develop`, the
   three spec-015 commands and the escape-hatch command are hidden and
   refuse to act, the replacement quick fix is not offered, and the visual
   editor's delete does not ask about a token that is not deprecated.
3. With it on, a rename keeps the old name as a `$deprecated` alias whose
   `$value` and replacement resolve to the new name, and rewrites every
   `$deprecated` replacement that named the old one. The alias and the
   collapse are pure `src/core/` edits, format-preserving (invariant 1).
4. A notification after a rename offers **Remove alias**, which removes the
   alias only while it is still the one the rename wrote.
5. `Rename Token Without Keeping Old Name` renames without the alias.
6. Deleting a token that still has uses, from the visual editor, offers
   **Deprecate instead / Delete anyway / Cancel**.

## Success criteria

- [ ] `tokenAtlas.deprecationWorkflow` exists in `contributes.configuration`, defaults to off, and with it off every behaviour in this issue is inert — rename behaves exactly as it does on `develop` today.
- [ ] With it on, a rename leaves the old name as a `$deprecated` token whose replacement resolves to the new name, and every in-repo use points at the new name.
- [ ] All three escape hatches exist: the `Rename Token Without Keeping Old Name` command, the `[Remove alias]` action on the rename notification, and the setting.
- [ ] Deleting a token that still has uses offers **Deprecate instead / Delete anyway / Cancel**.
- [ ] Each of the six edge cases above has a test, and `a → b → c` collapses to `c` rather than chaining.
- [ ] `specs/015-token-deprecation` is updated to describe the setting and the rename integration, so the spec folder matches what shipped.
- [ ] **Runnable:** `grep -q '"tokenAtlas.deprecationWorkflow"' package.json` — exit `1` on `develop@8f16363` today, exit `0` when this lands — and the full gate green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Needs from Chris

none

## Scope notes

Not in scope: sweeping existing hand-written chains in a workspace (only the
chain a rename touches is collapsed); a text-editor delete command (deleting
JSON by hand stays deleting JSON by hand); gating the reading side of
`$deprecated`, which predates the workflow.
