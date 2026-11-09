# Spec: docs/releasing.md says the Marketplace gets a manual .vsix upload once global PATs retire on 2026-12-01

**Issue**: [#89](https://github.com/chrisgriffin/token-atlas/issues/89)

## Overview

Microsoft retires global Azure DevOps personal access tokens on 2026-12-01, and the Marketplace publish uses one (`VSCE_PAT`). After that date the retired token makes `vsce publish` fail and the release run go red, until the `VSCE_PAT` repo secret is deleted; only then does the run skip the Marketplace with a notice and finish green. Either way the Marketplace no longer gets the release on its own, so `docs/releasing.md` is the only thing that tells whoever releases that a manual upload is owed. Today it says the opposite: every release is published to the Marketplace automatically and there are no manual steps.

## Functional requirements

- FR-001: `docs/releasing.md` states the 2026-12-01 retirement of global PATs and that from then on each release's `.vsix` reaches the Marketplace by a manual upload; Open VSX is unaffected.
- FR-002: § Manual steps names that upload: the `.vsix` comes from the GitHub Release's assets and goes to the Marketplace publisher's manage page.

## Success criteria

- [x] `docs/releasing.md` says global PATs are retired on 2026-12-01 and that from then on the Marketplace gets each release's `.vsix` by a manual upload.
- [x] § Manual steps lists that upload (where the `.vsix` comes from and where it goes) and no longer says there are none.
- [x] **Runnable:** `grep -c "2026-12-01" docs/releasing.md` prints 1 or more (0 on `develop`).

## Out of scope

- Changing the release workflow, or replacing the `VSCE_PAT` secret with a new token: the decided plan is a manual upload, not a new token. Deleting the secret on 2026-12-01 is listed in `docs/releasing.md` § Manual steps alongside the upload, because the shared release workflow skips the Marketplace only when the secret is empty.
- Open VSX publishing (#87, PR #88).

_Correction (Autofix, round 1): the Overview first said the run skips the Marketplace and finishes green after 2026-12-01 with no other change. The shared `_reusable-create-github-release.yml` skips only when `VSCE_PAT` is empty, and this repo's stub still passes it, so a retired token still set fails the publish; the Overview and this section now say so._
