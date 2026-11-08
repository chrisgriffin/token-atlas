# Plan: Put the deprecation workflow behind `tokenAtlas.deprecationWorkflow`, and wire rename into it

## Technical context

- Rename is `computeRenameEdits` / `computeReferenceRenameEdits` in
  `src/core/serialize.ts`, driven by `buildRenameEdit` in
  `src/host/rename.ts` for both F2 and the visual editor's `renameNode`.
- The deprecation tools are `src/host/deprecate.ts` (spec 015); the
  replacement is the first `{reference}` in `$deprecated`
  (`replacementKey`, `deprecationReplacement` in `src/core/validate.ts`,
  ADR-003).
- Settings are read with `getConfiguration("tokenAtlas").get<T>(key) ?? default`;
  `test/ci/configuration-defaults.test.ts` holds each fallback to the
  manifest and `test/ci/readme-*` holds the README table.

## Design decisions

1. **One core entry point for the aliasing rename,
   `computeAliasRenameEdits`,** beside `computeRenameEdits` in
   `serialize.ts`. It returns ranged edits against the original text: the
   key, the in-document references, the retargeted `$deprecated`
   replacements, and the alias inserted after the renamed property on a line
   of its own. Every edit is computed against one parse, so nothing overlaps
   and nothing else in the file moves.
2. **Renaming back onto the alias swaps names in place.** When the name taken
   is an alias of the node being renamed (every token under it deprecated and
   aliasing the matching path), the two keys trade names and the old alias's
   value becomes the new alias. No delete-and-insert at one offset.
3. **Collapse is a retarget, not a sweep.** Any `$value` reference or
   `$deprecated` replacement naming the old path moves to the new one; the
   replacement written follows the renamed token's own replacement chain to
   its end (cycle-safe), so no alias names a deprecated token.
4. **Other files get `computeReplacementRenameEdits`,** the `$deprecated`
   half of `computeReferenceRenameEdits`, with the same local-first skip.
5. **The setting is read in the host only** (`deprecationWorkflow()` in
   `deprecate.ts`); core functions take no setting. Manifest menus gate on
   `config.tokenAtlas.deprecationWorkflow`, which VS Code provides — no new
   `setContext`.
6. **The delete count reuses spec 015's readers.** `deprecatedReferences` is
   split over one walker, `tokenReferences`, so the uses of a token that is
   not deprecated are found by the same code, never a third matcher.
7. **Prompts are replaceable by `test/integration/`** like the removal
   prompt already is: the delete prompt and the alias notification.

## File structure

```
src/core/serialize.ts          # computeAliasRenameEdits, computeReplacementRenameEdits
src/core/validate.ts           # tokenReferences, under deprecatedReferences
src/core/index.ts              # exports
src/host/rename.ts             # alias when the setting is on; escape-hatch command; notification
src/host/deprecate.ts          # the setting gate; tokenUses; the delete prompt
src/host/tokenEditorProvider.ts# deleteNode through the prompt; renameNode notifies
src/extension.ts               # test hooks
package.json                   # setting, command, when clauses
test/core/rename-alias.test.ts # the six edge cases, core side
test/integration/deprecation-workflow.test.ts
test/integration/deprecation-flow.test.ts  # turns the setting on
test/ci/configuration-defaults.test.ts     # the new fallback site
```

## Surfaces touched

- `package.json` `contributes.configuration` — the new setting; README's settings table, which `test/ci` holds to the manifest, and the fallback site in `test/ci/configuration-defaults.test.ts`
- `package.json` `contributes.commands` / `contributes.menus` — the escape-hatch command; `when` clauses gain `config.tokenAtlas.deprecationWorkflow`, a VS Code context key, so the `setContext("tokenAtlas.isTokenDocument", …)` call in `src/extension.ts` is unchanged
- a published surface (an extension command and a setting) — `README.md` (commands and settings), `docs/design.md` § 2.1, CHANGELOG written by release tooling from the commit
- `specs/015-token-deprecation` — spec, plan and tasks note the setting and the rename integration (criterion 6)
- `test/integration/` — the setting, the notification, the commands and the delete prompt are host behaviour vitest cannot load
- none — no `.vscodeignore` entry (no new top-level directory), no workflow job renamed (ruleset untouched), no `dependencies`/`mainFields` change (invariant 2 unaffected), no vault note covers these paths

## Risk

Rename is the widest write the extension makes. The alias insertion and the
swap must not overlap any reference edit; core tests apply the edits with
`jsonc-parser`'s `applyEdits`, which throws on overlap, and assert the result
byte-for-byte on a file with unusual indentation.
