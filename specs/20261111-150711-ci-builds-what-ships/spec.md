# Spec: CI builds what ships

## Overview

The bundle users install is never built by CI. `esbuild.mjs` has two modes — a dev build and a `--production` build that minifies and drops the sourcemap — and only the dev one runs on a pull request. The production bundle is built for the first time when the release pull request merges, inside the release workflow, and it goes straight to a GitHub Release, Open VSX and the Marketplace from there.

Measured on `develop@d20f31d`:

- `build-check.yml`'s gate is `format:check`, `lint`, `typecheck`, `test`, `build`, `test:integration`. `npm run build` is `node esbuild.mjs` with no `--production`, so `minify` is false and `sourcemap` is true.
- `npm run package` is `vsce package`, which runs `vscode:prepublish` (`node esbuild.mjs --production`). Nothing in the gate runs `package` or `--production`.
- `test/ci/package-contents.test.ts` runs `npx vsce ls --no-dependencies`. `vsce ls` lists files and does **not** run `vscode:prepublish` — confirmed by running it: no esbuild output, no bundle sizes. So the one packaging check in CI never builds anything.
- The two builds differ substantially. Dev: `extension.js` 418.7 KB, `webview.js` 1.4 MB with esbuild's own size warning. Production: 207.0 KB and 299.0 KB. The shipped artifact is a different file.
- The release workflow's `build_command` is `npm ci && npm run build && npm run package`, so the dev build runs and is then overwritten by the production one. The first production build of a given tree happens in that job.

This matters because of non-negotiable invariant 2. `esbuild.mjs`'s `assertSelfContained` is the guard that catches a dependency which did not inline — and `CLAUDE.md` says the failure mode is a bundle that "installs fine and then fails to activate". That guard runs on whichever bundle was just built, so in CI it only ever reads the **dev** bundle. It matches string literals of the form `"./…"` in the output, and minification rewrites the output: it renames, hoists and re-splits strings. A verdict on the unminified bundle is therefore not a verdict on the minified one, which is the only one anybody installs.

Nothing is broken today — `node esbuild.mjs --production` passes the guard on this tree, checked this pass. The defect is that nothing checks it, and the place it would be discovered is the most expensive one available: after the release merges, after the `.vsix` is attached, and after two registries have it.

## User scenarios

- A contributor changes a dependency or `mainFields` and their pull request fails if the minified bundle keeps an unresolved relative require — rather than the release doing so days later.
- Whoever merges the release pull request is merging a tree whose production build has already been built and checked.
- A contributor runs one command locally and gets the same production verdict CI gives.

## Functional requirements

- FR-001: Every pull request builds the bundle in the same mode the published `.vsix` carries, and `assertSelfContained` runs against that bundle.
- FR-002: A pull request fails when the production bundle keeps an unresolved relative module reference, even if the dev bundle does not.
- FR-003: The packaging step runs on a pull request too, so a `.vsix` that cannot be produced from the tree fails before release rather than at it.
- FR-004: The order in which the gate builds is explicit and recorded. The integration suite reaches the extension through `dist/`, so which build is on disk when it runs is a decision, not an accident: state which one it runs against and why.
- FR-005: The gate's command chain stays in `build-check.yml`'s `run:` input, this repo's own, and the `build` job keeps its name so the required `build / ci` check still reports and no branch ruleset edit is owed.
- FR-006: A contributor can run the same production check locally with one named script, rather than remembering an argument to `esbuild.mjs`.
- FR-007: `docs/testing.md`, `docs/releasing.md` and `CLAUDE.md` say what the gate builds and that it is the mode that ships; `CLAUDE.md` stays inside its 8500-byte budget.

## Success criteria

- [ ] **Runnable:** `npm run build:production` exits 0 and its output shows the minified bundle sizes. Red on `develop` today, where no such script exists and npm exits 1 with `Missing script: "build:production"`.
- [ ] The gate chain in `.github/workflows/build-check.yml` runs the production build and the packaging step. Quote the new chain in the pull request.
- [ ] Breaking the self-contained guard so that only the minified bundle trips it makes the gate fail. Record what was broken, the failure, and the revert in the pull request.
- [ ] `npm run package` succeeds in the gate and produces a `.vsix`, and `test/ci/package-contents.test.ts` still passes.
- [ ] The pull request says which build is on disk when `test:integration` runs, and why that is the right one.
- [ ] The `build` job is still named `build`, so the required `build / ci` check reports unchanged. No branch ruleset edit is owed; say so in the pull request.
- [ ] `docs/testing.md`, `docs/releasing.md` and `CLAUDE.md` say the gate builds the mode that ships, and `wc -c CLAUDE.md` is under 8500.
- [ ] The pull request names the added CI time, measured from the job, not estimated.

## Out of scope

- Changing what the production build does. `minify` and the dropped sourcemap stay exactly as they are; this runs them earlier, it does not retune them.
- The 1.4 MB dev webview bundle and esbuild's size warning on it. The dev bundle is for debugging and its size is not a shipped number — the shipped one is 299 KB.
- Publishing from a pull request. Nothing here uploads anything; the `.vsix` is built and discarded.
- The redundant `npm run build` in the release workflow's `build_command`, which `npm run package` immediately overwrites. Harmless, and untangling the release workflow is a separate change.
