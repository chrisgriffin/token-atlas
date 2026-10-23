# Feature Specification: Document the Open VSX publish in releasing.md

**Feature Branch**: `013-releasing-open-vsx`
**Issue**: #21
**Status**: Built

## Summary

A release publishes the same `.vsix` to Open VSX as well as the VS Code Marketplace (#15), but `docs/releasing.md` names only the Marketplace. The doc says both registries, the secret each needs, and what a release does when one is missing.

## User Scenarios & Testing

### User Story 1 - Someone cutting or debugging a release learns about both publishes (Priority: P1)

Reading `docs/releasing.md` alone tells them the release publishes to two registries, that `VSCE_PAT` and `OVSX_PAT` gate them, and that a missing token skips only its own registry with a notice.

**Independent Test**: `grep -c "Open VSX" docs/releasing.md` prints at least `1`.

### Edge Cases

- Both tokens missing: the publish step logs one notice and publishes nothing; the GitHub Release still carries the `.vsix`.
- One publish fails: the other still runs, and the step fails at the end.

## Requirements

- **FR-001**: `docs/releasing.md` says a release publishes the same `.vsix` to Open VSX and the VS Code Marketplace, naming `VSCE_PAT` and `OVSX_PAT`.
- **FR-002**: It says a registry whose token is missing is skipped with a notice while the other still publishes.
- **FR-003**: Every other doc that names the Marketplace as the only registry says Open VSX too.

## Success criteria

- [ ] `docs/releasing.md` says a release publishes the same `.vsix` to Open VSX as well as the VS Code Marketplace, and names the secret each registry needs.
- [ ] It says what a release does when one registry's token is missing (that registry is skipped with a notice; the other still publishes).
- [ ] **Runnable:** `grep -c "Open VSX" docs/releasing.md` prints at least `1`. It prints `0` on `develop` today.

## Needs from Chris

none
