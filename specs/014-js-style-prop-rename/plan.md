# Implementation Plan: Rename leaves DOM style properties in JS/TS alone

**Branch**: `014-js-style-prop-rename` | **Spec**: [spec.md](./spec.md)

## Summary

Narrow `scanIdentifiers` in `src/core/exportNames.ts` for JS/TS the way #14 narrowed it for stylesheets: skip a name that is a DOM style property unless the file imports it. Every consumer of the scan (rename, Find References, the unused-token hint, all through `src/host/codeUsages.ts`) follows with no host change.

## Technical context

- Pure core change, no `vscode`, no new dependency (invariant 2 untouched).
- `STYLE_PROPERTIES`: a hand-kept kebab list of standard CSS properties, camelCased once at load.
- `importedNames(text)`: local names from `import` clauses (default, named, `as`, `* as`, `type`) and `const … = require(…)` (plain and destructured, `a: b` renames).
- `isStyleProperty(name, imported, exported)`: last dotted part in the list, root not imported, not an `export const`; a one-word last part counts as a property only when bare or after `.style.`.
- `scanIdentifiers` applies it when `languageId` is a JS/TS language id or a closed file's extension (`codeUsages.ts` passes either).
- Hover and go-to-definition read the word under the cursor through `canNameToken`, not the scan, and are left as they are: the issue is about rewriting code, and a hover is harmless.
- Test: `test/core/exportNames-js-style-props.test.ts` re-plays `rename.ts`'s scan → match → `renameInIdentifier` path over text.

## Decision

Recorded as `docs/adr/ADR-002-js-style-property-names.md`, with the two options the issue named and why neither alone was taken.

## Surfaces touched

- `src/core/exportNames.ts` — the JS/TS filter in `scanIdentifiers`.
- `test/core/exportNames-js-style-props.test.ts` — new; the runnable line.
- `docs/architecture.md` — the Find References paragraph says which names count.
- `docs/adr/ADR-002-js-style-property-names.md` and `docs/adr/README.md` — the decision and its index row.
- `specs/014-js-style-prop-rename/` — this folder; `specs/**` is already in `.vscodeignore`.
- CLAUDE.md couplings: none — no `contributes.menus`, esbuild, workflow job or ignore file change.
- Fleet surfaces: none — no published surface, command, setting, workflow or ruleset changes; the README's "every alias and code usage follows" stays true.
