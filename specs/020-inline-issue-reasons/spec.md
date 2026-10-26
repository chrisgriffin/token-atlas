# Spec: Comments and docs give the reason in words instead of citing issue numbers from another tracker

**Issue**: [#41](https://github.com/chrisgriffin/token-atlas/issues/41)

## Overview

Comments in the source, tests and docs cite bare issue numbers such as
`#304` and `#449` that belong to the tracker this code came from, not to this
repository, whose own issues only reach the forties. GitHub links them into
this repo's tracker, where they will point at unrelated issues as it grows,
and readers of this public repo cannot reach the original discussions. Each
citation is replaced with the reason in words, or dropped where the sentence
already says it.

## Scope

- Every `#NNN` in `src/`, `test/`, `docs/` and `.vscode-test.mjs` that names
  an issue outside this repo's tracker: the fourteen numbers the issue lists,
  and the twenty-odd more the same sweep finds in those folders.
- ADR-001's `Implemented by [#108](…/token-atlas/issues/108)` link, which
  resolves to an issue that does not exist here.
- `CLAUDE.md` invariant 2's "v0.0.x shipped broken because of this".

Not in scope: references to this repo's own issues (`#2`, `#8`, `#14`, `#16`,
`#28`, `#32`, `#34`, `#36`, `#37`), hex colours, and `CHANGELOG.md`, which is
written by release tooling and cites only this repo's issues.

## Success criteria

- [ ] No comment, test or doc cites an issue number that does not exist in this repo's tracker; each says the reason in words instead.
- [ ] `CLAUDE.md` no longer refers to a release this repo never shipped as if it were this repo's.
- [ ] **Runnable:** `grep -rnE '#(170|185|186|274|298|304|307|310|387|388|414|424|434|449)\b' src test docs .vscode-test.mjs | wc -l` prints `0` (today `20`).
- [ ] `npm run verify` exits 0.

## Needs from Chris

none

## Scope notes

This repo defines no `verify` script. Its gate is `CLAUDE.md`'s build gate,
`npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`,
plus `npm run lint`; that chain stands for criterion 4. Adding a `verify`
script is a separate change.
