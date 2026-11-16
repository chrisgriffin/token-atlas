# Spec: Two test comments cite #36, an issue moved to a tracker this public repo cannot link to

**Issue**: [#91](https://github.com/chrisgriffin/token-atlas/issues/91)

## Overview

Two test files open with a comment citing `#36` as the source of the deprecation workflow. That issue moved to a tracker this public repo cannot link to, so a reader who follows the reference gets a page they cannot open, and GitHub will link `#36` to whatever unrelated issue later takes that number here. Both comments already name spec 019, which lives in this repo, so the issue number can go.

## Functional requirements

- FR-001: No comment, test or doc under `src/`, `test/` or `docs/` cites `#36`.
- FR-002: Each line that did still says what it refers to, by pointing at spec 019 in this repo.

## Success criteria

- [x] No comment, test or doc under `src/`, `test/` or `docs/` cites `#36`. Each line that did says what it refers to in words or points at something in this repo.
- [x] **Runnable:** `grep -rnE '#36([^0-9]|$)' src test docs | wc -l` prints `0` (`2` on `develop`).

## Out of scope

- References to `#36` under `specs/` or in `CHANGELOG.md`: the issue names `src/`, `test/` and `docs/` only.
