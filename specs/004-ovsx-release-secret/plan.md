# Implementation Plan: Pass the Open VSX token to the release workflow

**Branch**: `002-ovsx-release-secret` | **Spec**: [spec.md](spec.md)

## Summary

One line in the release stub's `secrets:` block and one stub test.

## Technical Context

- The stub calls `_reusable-create-github-release.yml@v1` with named secrets (`test/ci/workflow-stub-guards.test.ts` pins "never inherit").
- chrisgriffin/workflows#18 declares `OVSX_PAT` in that body; `v1` moves when the workflows release PR merges.

## Surfaces touched

- `.github/workflows/create-github-release.yml`: a new named secret; no job renamed (the `build` job in `build-check.yml` and its ruleset are untouched).
- `test/ci/workflow-stubs.test.ts`: the stub's secrets.
- No `src/`, README, docs, `package.json` or `.vscodeignore` change; `specs/` is already outside the packaged extension.
