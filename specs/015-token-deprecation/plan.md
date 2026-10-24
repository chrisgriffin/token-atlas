# Plan: Carry out a token deprecation — mark it, move its uses, remove it once unused

## Technical context

- TypeScript, esbuild bundle, vitest for `core`/`webview`/`ci`/`host`, a
  downloaded VS Code for `test/integration/`.
- The read side already exists in `src/core/validate.ts`:
  `deprecation(token)`, `deprecationMessage(key, value)`,
  `deprecatedReferences(model, …)`. `test/core/deprecated.test.ts` has eight
  cases over `deprecatedReferences`, including group inheritance, alias
  chains, composite sub-paths, `$ref` pointers and document-before-index
  precedence.
- Uses in stylesheets and code are found by `src/host/codeUsages.ts`;
  diagnostics and the strike-through live in `src/host/diagnostics.ts`.
- Cross-file resolution reads `src/host/workspaceIndex.ts`.
- Edits go through `src/core/serialize.ts` and come out as ranged
  `WorkspaceEdit`s.

## Design decisions

1. **The replacement lives inside `$deprecated`, as the first `{reference}`
   in the reason string.** Spelled out with its reasoning in `spec.md`
   § Decision. One consequence for this plan: no change to the resolver
   document rules, no new `$`-field, and every existing reader keeps working
   with no change.
2. **One new pure `core` function reads it** — given a token, return the
   resolved replacement token path, or nothing. Everything else consumes
   that. This is what keeps the quick fix, the list and the removal guard
   from each re-parsing the string their own way.
3. **Writing the flag is one `core` edit builder plus two thin callers.** The
   text-editor path is a command; the visual-editor path sends an intent over
   `src/shared/protocol.ts`. Neither applies the edit itself — the host does,
   per the layering rule.
4. **The quick fix is per-use, never a sweep.** A replacement is not
   guaranteed value-identical, and a one-command workspace-wide rewrite is
   exactly the kind of write that breaks the product's reason to exist.
   Criterion 5's list is how a person drives the per-use fixes to completion.
5. **The remaining-uses list is built from the workspace index**, not from
   open documents, so a use in an unopened file counts. Local-first
   resolution (invariant 4) still applies when the active document holds the
   same path.
6. **The removal guard counts before it deletes.** It reuses the same count
   the list uses; two code paths that could disagree about "unused" would be
   worse than the problem.

## File structure

```
src/core/validate.ts          # + the replacement reader (pure)
src/core/serialize.ts         # + the $deprecated edit builder, if it does not fit an existing one
src/shared/protocol.ts        # + the deprecate intent from the visual editor
src/host/languageFeatures.ts  # + the quick fix on a deprecated use
src/host/diagnostics.ts       # the diagnostic the quick fix attaches to
src/host/codeUsages.ts        # the stylesheet/code side of the use set
src/host/workspaceIndex.ts    # the source for the remaining-uses list
src/host/tokenTree.ts         # where the remaining-uses list surfaces
src/webview/…                 # the deprecate affordance in the visual editor
package.json                  # + the command(s) and any menu/when clause
test/core/deprecated.test.ts  # the core cases, incl. the runnable line's "replacement" test
test/integration/             # the code action, the list and the removal prompt
specs/015-token-deprecation/
```

Exact file set is the build's to settle; what matters is that no `vscode`
import reaches `src/core/` and no file write reaches `src/webview/`.

## Surfaces touched

- **`package.json`'s `contributes.commands` / `contributes.menus`** — a new
  command needs its manifest entry, and a `when` clause on a menu needs the
  matching `setContext("tokenAtlas.isTokenDocument", …)` call in
  `src/extension.ts` that feeds it (`CLAUDE.md` § Architecture, row 1).
  `test/ci/manifest-couplings.test.ts` covers the identifier side.
- **`docs/design.md` § 2.1, the file-by-file host map** — new host behaviour
  (a code action provider, the remaining-uses view, the removal guard) changes
  what the host layer does, so its map changes with it.
- **`README.md`** — the feature list a Marketplace visitor reads. The
  extension is published as `chrisgriffinio.token-atlas`, so the listing is
  the published surface and a new user-facing capability belongs in it.
- **`CHANGELOG.md`** — written by the release tooling from conventional
  commits, so nothing to hand-edit; named here so a reviewer knows it was
  considered rather than missed.
- **`test/integration/`** — anything about a code action, a tree view or a
  command cannot be tested by vitest, so the integration suite is where those
  criteria land. Not optional: four of the six success criteria are
  host-level.
- **No `.vscodeignore` entry is owed** — this change adds no top-level
  directory. `specs/` is already covered.
- **No branch ruleset change is owed** — no workflow job name changes, so the
  required `build / ci` check keeps reporting under the same name.
- **No `dependencies` or `mainFields` change** — nothing new is bundled, so
  invariant 2's post-build guard is unaffected.
- **A `docs/adr/` record is owed for the `$deprecated`-string decision.** It
  is a format-level choice the project will be held to by every token file
  anyone writes, and the alternative (a sibling `$`-field) was rejected for a
  reason worth keeping. Link it from the PR.

## Risk

Medium, and concentrated in one place: criterion 4's quick fix writes to a
file the person did not open, through `codeUsages`, whose matching was
narrowed twice already for exactly this class of over-reach (CSS/Sass/Less,
then JS/TS DOM style properties, #16). **Every use the quick fix offers to
rewrite must be a use the existing readers already report**, not a fresh
match — reuse `deprecatedReferences()` and `codeUsages`, do not write a third
matcher. A new matcher here is how the same bug arrives a third time.

Lower risk, worth stating: a `$deprecated` string that happens to contain
`{…}` that is not a token path. The reader resolves it like any other
reference and criterion 7 reports it by name when it does not resolve, so the
failure mode is a named report rather than a wrong rewrite.
