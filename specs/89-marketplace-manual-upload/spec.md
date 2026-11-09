# Spec: docs/releasing.md says the Marketplace gets a manual .vsix upload once global PATs retire on 2026-12-01

**Issue**: [#89](https://github.com/chrisgriffin/token-atlas/issues/89)

## Overview

Microsoft retires global Azure DevOps personal access tokens on 2026-12-01, and the Marketplace publish uses one (`VSCE_PAT`). After that date the release run skips the Marketplace with only a notice and finishes green, so `docs/releasing.md` is the only thing that tells whoever releases that a manual upload is owed. Today it says the opposite: every release is published to the Marketplace automatically and there are no manual steps.

## Functional requirements

- FR-001: `docs/releasing.md` states the 2026-12-01 retirement of global PATs and that from then on each release's `.vsix` reaches the Marketplace by a manual upload; Open VSX is unaffected.
- FR-002: § Manual steps names that upload: the `.vsix` comes from the GitHub Release's assets and goes to the Marketplace publisher's manage page.

## Success criteria

- [x] `docs/releasing.md` says global PATs are retired on 2026-12-01 and that from then on the Marketplace gets each release's `.vsix` by a manual upload.
- [x] § Manual steps lists that upload (where the `.vsix` comes from and where it goes) and no longer says there are none.
- [x] **Runnable:** `grep -c "2026-12-01" docs/releasing.md` prints 1 or more (0 on `develop`).

## Out of scope

- Changing the release workflow or the `VSCE_PAT` secret: the decided plan is a manual upload, not a new token.
- Open VSX publishing (#87, PR #88).
