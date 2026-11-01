# Spec: Give every spec folder a unique number

## Overview

`specs/` is the repo's record of what each change was specced to do, and a
`Spec:` line on an issue points at one folder by its three-digit number. Three
numbers are currently shared by more than one folder, so a number no longer
identifies a spec. One of those pairs is worse than a naming clash: two folders
spec the same issue, left behind when a single build-queue issue fired two Build
runs and both pull requests merged seconds apart
([chrisgriffin/ops#1746](https://github.com/chrisgriffin/ops/issues/1746)).

Measured on `develop@b44bc51`:

| number | folders                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------- |
| `002`  | `002-core-model-fixes`, `002-marketplace-listing`, `002-ovsx-release-secret`                   |
| `019`  | `019-deprecation-workflow-setting` (#36 / PR #39), `019-drop-changelog-tooling` (#40 / PR #42) |
| `020`  | `020-drop-changelog-tooling` (#40 / PR #43), `020-inline-issue-reasons` (#41 / PR #44)         |

`ls specs | cut -d- -f1 | sort | uniq -d` prints `002`, `019`, `020`.

The `019-drop-changelog-tooling` and `020-drop-changelog-tooling` pair are the
same work specced twice for issue #40; their `spec.md`, `plan.md` and
`tasks.md` all differ, so one of the two is a dead record of a build that
duplicated another.

## User scenarios

1. **A reader follows a `Spec:` line.** An issue's `Spec:` line
   names a folder numbered `019`; the reader lists `specs/` and finds exactly one folder
   beginning `019-`, and it is the one that specced that issue.
2. **A reader asks what specced issue #40.** They find one folder, not two
   that disagree with each other.
3. **A later change adds a spec.** The next free number is unambiguous,
   because no number is already taken twice.

## Functional requirements

1. Every folder directly under `specs/` has a leading three-digit number that
   no other folder under `specs/` shares. Folders under
   `specs/*/checklists/` and any other nested directory are out of scope.
2. Exactly one spec folder covers issue #40. Whichever of the two is kept
   describes the change that actually merged to `develop`; the other is
   removed.
3. Any renumbered folder's old number is no longer referenced from a path
   inside `specs/`, from source, from docs, or from a workflow. The
   `.agents/` overlay is operator content laid at runtime and is not part of
   this repo's tree, so its references are out of scope.
4. The spec record stays legible: a renumbered folder keeps its slug and its
   contents, and only its number changes.

## Non-goals

- Preventing a future collision in whatever assigns the next number.
  That is [chrisgriffin/ops#1726](https://github.com/chrisgriffin/ops/issues/1726)
  and it changes the operator, not this repo.
- Reconciling the two duplicate pull requests, #42 and #43. Both merged and
  their code effect is settled; only the leftover spec folder is in scope.
- Back-filling or correcting the content of any spec that is not renumbered.

## Success criteria

- [ ] **Runnable:** `ls specs | cut -d- -f1 | sort | uniq -d` prints nothing
      and exits 0. On `develop@b44bc51` it prints `002`, `019`, `020`.
- [ ] `ls -d specs/*-drop-changelog-tooling | wc -l` prints `1`.
- [ ] `grep -rn "specs/002-\|specs/019-\|specs/020-" specs/ src/ docs/ .github/ README.md` names no path that does not exist on disk.
- [ ] `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` exits 0.

## Needs from Chris

none
