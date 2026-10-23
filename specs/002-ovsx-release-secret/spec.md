# Feature Specification: Pass the Open VSX token to the release workflow

**Feature Branch**: `002-ovsx-release-secret`
**Issue**: #12
**Status**: Built

## Summary

The shared release workflow gains an Open VSX publish beside the VS Code Marketplace one (chrisgriffin/workflows#18), reading an `OVSX_PAT` secret each caller passes by name. This repo's release stub passes it, so a Token Atlas release also reaches Open VSX once the secret exists.

## User Scenarios & Testing

### User Story 1 - A release reaches Open VSX (Priority: P1)

A merged release PR publishes the `.vsix` to Open VSX as well as the Marketplace, once `OVSX_PAT` is set; until then the release run says Open VSX was skipped.

**Independent Test**: `npx vitest run test/ci/workflow-stubs.test.ts -t 'create-github-release'`.

### Edge Cases

- A stub passing a secret the called workflow does not declare fails the run, so this merges only after the workflows release that moves `v1` past chrisgriffin/workflows#18.

## Requirements

- **FR-001**: `.github/workflows/create-github-release.yml` passes `OVSX_PAT: ${{ secrets.OVSX_PAT }}` beside `VSCE_PAT`, by name.
- **FR-002**: `test/ci/workflow-stubs.test.ts` pins both named secrets.

## Success criteria

- [ ] The release stub passes `OVSX_PAT` by name beside `VSCE_PAT`, never `secrets: inherit`.
- [ ] The stub merges only after the workflows release that moves `v1` to a version declaring `OVSX_PAT`; before that, a stub passing it would fail the release run.
- [ ] **Runnable:** `npx vitest run test/ci/workflow-stubs.test.ts -t 'create-github-release'` passes on the PR head; on `develop` it fails.

## Needs from Chris

1. Merge this only after the chrisgriffin/workflows release that moves `v1` past chrisgriffin/workflows#18. Where: this PR. When: after that release merges.
2. Add the Open VSX access token as this repo's `OVSX_PAT` repository secret. Where: sign in at open-vsx.org with an Eclipse account, accept the publisher agreement, create a token under Settings > Access Tokens, run `npx ovsx create-namespace <publisher>` once with `OVSX_PAT` set to the token, then Settings > Secrets and variables > Actions here. When: after merge.
