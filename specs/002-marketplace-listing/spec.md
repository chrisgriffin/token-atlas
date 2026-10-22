# Feature Specification: Marketplace listing ready for 1.0.0

**Feature Branch**: `002-marketplace-listing`
**Issue**: #7
**Status**: Built

## Summary

Token Atlas 1.0.0 is published to the VS Code Marketplace as `chrisgriffin.token-atlas` when the release PR merges, and the README becomes the listing page. The README and docs still say it is not on the Marketplace, vsce points the listing's screenshots at the default branch (`develop`), the `.vsix` carries 1.4 MB of screenshots the listing never reads from it, and the manifest has no banner color or lint category. Chris requested the pre-1.0 audit findings be fixed before the release on 2026-10-22.

## User Scenarios & Testing

### User Story 1 - Install from the Marketplace (Priority: P1)

Someone reads the listing or the GitHub README and installs Token Atlas the normal way, from the Extensions view, with the `.vsix` as a fallback.

**Independent Test**: `npx vitest run test/ci/marketplace-listing.test.ts`.

**Acceptance Scenarios**:

1. **Given** the README, **When** a reader opens Install, **Then** it names the Extensions view search, `ext install chrisgriffin.token-atlas` and `code --install-extension chrisgriffin.token-atlas`, then the release `.vsix`.
2. **Given** the listing, **When** it renders, **Then** every screenshot and relative link resolves on `main`, the branch a release is cut from.

### User Story 2 - A lean, well-labeled package (Priority: P2)

**Independent Test**: `npx vitest run test/ci/package-contents.test.ts`.

**Acceptance Scenarios**:

1. **Given** `npm run package`, **When** the `.vsix` is listed, **Then** it holds no README screenshot and no SVG but the activity-bar icon.
2. **Given** the manifest, **When** the Marketplace reads it, **Then** it shows a banner in the icon's background color and the extension under Linters.

### Edge Cases

- A README screenshot added after this lands is still excluded (`media/*.png` except `icon.png`) and still loads from GitHub.

## Requirements

- **FR-001**: README Install leads with the Marketplace; no doc says the extension is not on it.
- **FR-002**: `npm run package` passes `--githubBranch main`.
- **FR-003**: `.vscodeignore` drops the screenshots and `media/icon.svg`.
- **FR-004**: `package.json` has a `galleryBanner`, the `Linters` category and a few more honest keywords.
- **FR-005**: README links the 2025.10 format and resolver specs.

## Success criteria

- [x] The README's Install section leads with the Marketplace (Extensions view search, `ext install chrisgriffin.token-atlas`, `code --install-extension chrisgriffin.token-atlas`), with the GitHub Release `.vsix` as the fallback, and no doc (README, CLAUDE.md, `docs/`) says the extension is not on the Marketplace.
- [x] A packaged `.vsix`'s README points every relative link and screenshot at `main` and every one returns 200, and the `.vsix` ships no README screenshot and no unused SVG.
- [x] `package.json` sets a `galleryBanner` in the icon's background color, lists the extension under `Linters`, and adds honest search keywords.
- [x] The README links the stable 2025.10 DTCG format and resolver specs, not the drafts.
- [x] **Runnable:** `npx vitest run test/ci/marketplace-listing.test.ts test/ci/package-contents.test.ts` exits 0 (today 8 tests fail).

## Assumptions

- Banner color `#1C1F3F` with the `dark` theme: the top stop of `media/icon.svg`'s background gradient.
- Keywords added: `w3c`, `tokens studio` (its `$themes` feed the active-set picker), `style dictionary` (its DTCG input and its CSS/Sass/JS output both work), `css variables`, `color`. No `figma`: there is no Figma sync.
- `CHANGELOG.md` is left alone; the release PR generates it.

## Needs from Chris

none
