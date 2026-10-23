# Implementation Plan: Document the Open VSX publish in releasing.md

**Branch**: `013-releasing-open-vsx` | **Spec**: [spec.md](spec.md)

## Summary

Prose only: the summary, § What this repo ships and § Manual steps of `docs/releasing.md`, plus the two other docs that call the Marketplace the only registry.

## Technical Context

- `.github/workflows/create-github-release.yml` passes `VSCE_PAT` and `OVSX_PAT` by name to `_reusable-create-github-release.yml@v1`.
- That body's `marketplace` job publishes to each registry independently: a missing token skips that registry with a notice, both missing logs one notice and exits, and a failure in either fails the step after both have run.
- The Open VSX namespace is the publisher, `chrisgriffinio`; the earlier publisher was `chrisgriffin`, so a `.vsix` from before that change installed as `chrisgriffin.token-atlas`.

## Surfaces touched

- `docs/releasing.md`: summary, § What this repo ships, § Manual steps. Only the repo's own slots; the fleet-shared sections are untouched.
- `docs/architecture.md`: the one line naming the release output.
- `CLAUDE.md` § Releasing: the one line naming where a release publishes.
- No code, workflow, `package.json` or `.vscodeignore` change; no job renamed, so the ruleset is untouched. `specs/` is already outside the packaged extension.
