# Tasks: Marketplace listing ready for 1.0.0

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Tests first

- [x] T001 Add `test/ci/marketplace-listing.test.ts`: Install by extension id, no stale "not on the Marketplace" line, `--githubBranch main`, banner in an icon color, `Linters`, stable spec links.
- [x] T002 Flip `test/ci/package-contents.test.ts` to ship no README screenshot and only `media/map.svg`; run both and record the red run.

## Phase 2: Fix

- [x] T003 `package.json`: `galleryBanner`, `Linters`, keywords, `package` script.
- [x] T004 `.vscodeignore`: exclude `media/*.png` but `icon.png`, and `media/icon.svg`.
- [x] T005 README Install, spec links, swatch line.
- [x] T006 Docs: `releasing.md`, `architecture.md`, `design.md` (drop the dead issue reference), `testing.md`, `CLAUDE.md`.

## Phase 3: Verification

- [x] T007 Package with `--githubBranch main`, unzip `extension/readme.md`, curl every URL for 200; `vsce ls` for the file list.
- [x] T008 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
