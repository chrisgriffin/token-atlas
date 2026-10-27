# Plan: Give every spec folder a unique number

Spec: [`spec.md`](./spec.md) · Branch: `021-unique-spec-numbers`

## Technical context

- No source change. `specs/` is a documentation tree; nothing under `src/`,
  `test/` or `.github/` reads a spec folder name at build or test time
  (`grep -rn "specs/" src/ test/ .github/` finds no path reference).
- The only in-repo references to a colliding number are two task files:
  `specs/019-deprecation-workflow-setting/tasks.md` and
  `specs/020-inline-issue-reasons/tasks.md`. Each cites its own folder.
- The two `*-drop-changelog-tooling` folders both spec issue #40, which merged
  twice as PR #42 and PR #43. Their `spec.md`, `plan.md` and `tasks.md` all
  differ, so the choice of which to keep is a reading of what landed, not a
  coin toss.
- `.agents/**` is operator content laid over the checkout at runtime and is
  never committed here, so its mentions of the `019` and `020` folders
  are outside this repo's tree and must not be edited.

## Design decisions

1. **Renumber, never re-slug.** A folder keeps its slug so the record stays
   searchable by what it was about; only the leading number moves. Renames go
   through `git mv` so history follows.
2. **The lowest-numbered folder of a colliding set keeps the number.** Within
   each collision, the folder whose number matches the order it was actually
   specced keeps it and the later ones move to free numbers; this keeps the
   tree's rough chronology readable.
3. **Free numbers are taken from the first unused values below the current
   high-water mark**, not appended after it, so the sequence stays dense and
   the next spec still gets the next number. On `develop@b44bc51` the free
   values below `021` are `003`, `004`, `005`, `007`, `008`, `009` and `010`,
   so the three folders that move take `003`, `004` and `005`.
4. **Which drop-changelog folder to keep is decided by reading `develop`.**
   The kept folder is the one whose `tasks.md` matches the state of the tree
   after both PRs merged (the changelog tooling is gone, `package.json` and
   `package-lock.json` reflect it). The other folder is deleted, not merged
   into the first — two divergent records of one change are the defect, so
   collapsing them by hand would recreate it in one file.
5. **`021-unique-spec-numbers` is this change's own folder** and already holds
   a unique number; it is not part of the renumbering.

## File structure

```
specs/
  002-core-model-fixes/            keeps 002
  002-marketplace-listing/      →  003-marketplace-listing/
  002-ovsx-release-secret/      →  004-ovsx-release-secret/
  019-deprecation-workflow-setting/ keeps 019
  019-drop-changelog-tooling/   →  005-drop-changelog-tooling/ (kept: PR #42 carried the code)
  020-drop-changelog-tooling/   →  deleted (PR #43 added only this folder)
  020-inline-issue-reasons/        keeps 020
  021-unique-spec-numbers/         this change
```

Each renumbered folder's own `tasks.md` and any sibling spec that cites its old
path are updated in the same commit.

## Surfaces touched

- `docs/architecture.md` — none: `specs/` is not a part this document
  describes and no directory is added, removed or renamed at the level it
  covers. Confirm with a read before the PR; if it names `specs/` by any
  folder number, that line changes.
- `README.md` — none: it names no spec folder.
- a rule stated in more than one doc — none: this changes no rule.
- a published surface (a `bin`, an export, a command, a config schema, a
  report shape) — none: no runtime surface moves, so no CHANGELOG entry is
  owed either.
- `.vscodeignore` / `test/ci/package-contents.test.ts` — none: no top-level
  directory is added, and `specs/` is already handled however it is handled
  today; re-run `npm test` to confirm the packaged-contents allow-list still
  passes.
- a required check name — none: no workflow job name changes, so no branch
  ruleset edit.
- `docs/adr/` — none: this is cleanup after a known incident, not a new
  decision. The incident's own records are
  [chrisgriffin/ops#1746](https://github.com/chrisgriffin/ops/issues/1746) and
  [chrisgriffin/ops#1726](https://github.com/chrisgriffin/ops/issues/1726).
- a vault living doc whose `covers:` names a path in this repo — **cannot
  appear in a repo diff.** No vault note is expected to name a spec folder
  number here; the build confirms with `grep -rl "token-atlas:specs" AI/` in
  the vault if it has vault access, and records the result as one line in the
  PR body. A shift has no vault access, so an unverified result is said as
  unverified.
