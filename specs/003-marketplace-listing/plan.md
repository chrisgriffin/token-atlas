# Implementation Plan: Marketplace listing ready for 1.0.0

**Branch**: `002-marketplace-listing` | **Spec**: [spec.md](./spec.md)

## Summary

Listing and docs only: README Install and spec links, `package.json` listing fields and `package` script, `.vscodeignore`, and the stale Marketplace lines in the docs, each pinned by a `test/ci` test. No `src/` change.

## Technical context

- vsce 3.9 rewrites a README's relative links to `https://github.com/<repo>/raw/HEAD/...`, which GitHub serves from the default branch, `develop`. `--githubBranch main` makes it `raw/main/`.
- The release publishes the very `.vsix` `npm run package` builds (`marketplace_packages: ./*.vsix` in `create-github-release.yml`), so the flag reaches the listing.
- `.vscodeignore` supports `!` negation, so `media/*.png` plus `!media/icon.png` keeps the Marketplace icon.

## Surfaces touched

- `README.md`: Install, DTCG spec links, one swatch line corrected (the checkerboard is in hovers).
- `package.json`: `galleryBanner`, `categories`, `keywords`, `scripts.package`.
- `.vscodeignore`: screenshots and `media/icon.svg`.
- `test/ci/marketplace-listing.test.ts` (new) and `test/ci/package-contents.test.ts` (allow-list).
- `docs/releasing.md`, `docs/architecture.md`, `docs/design.md`, `docs/testing.md`, `CLAUDE.md` (the stale Marketplace line only).
- Published surface: the Marketplace listing itself (README, manifest fields). No command, setting or export changes.
- Fleet surfaces: none apply (no workflow, ruleset or rule doc changes).
