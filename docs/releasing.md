# Releasing

A release of Token Atlas is a packaged `.vsix` extension, attached to a GitHub Release and published to the VS Code Marketplace as `chrisgriffinio.token-atlas`.

## How a release happens

1. Work merges into `develop` through a PR.
2. Every push to `develop` runs `release-pr.yml`. It computes the next
   version from the Conventional Commits since the last `vX.Y.Z` tag,
   updates `package.json` and `CHANGELOG.md`, and keeps one rolling
   `release/next` PR into `main` up to date. A push that only merges `main`
   back into `develop` has nothing to release and changes nothing.
3. A human merges `release/next` into `main`. That merge is the release.
4. The merge runs `create-github-release.yml`, which tags `vX.Y.Z` and
   creates the GitHub Release from that version's `CHANGELOG.md` entry,
   along with anything this repo builds or publishes (below).
5. `sync-main-to-develop.yml` merges `main` back into `develop`. When the
   merge conflicts, or `develop`'s ruleset refuses the push, it opens a
   `sync/main-to-develop-*` PR instead, for a human to merge.

All three files are thin stubs calling the shared release workflows in the
public `chrisgriffin/workflows` repo.

## Versioning

- `feat` is a minor bump; `fix`, `perf` and every other type are a patch; a
  `type!:` subject or a `BREAKING CHANGE:` footer is a major, or a minor
  while the version is below `1.0.0`.
- Tags are bare `vX.Y.Z`.
- `release-pr.yml` pushes and opens the release PR with `RELEASE_PR_TOKEN`,
  a personal access token, because GitHub starts no workflows for events
  created by the built-in `GITHUB_TOKEN`: without it, the release PR's
  checks never run on their own.

## Hotfixes

A hotfix is only a change Chris calls a hotfix. It branches off `main` as
`hotfix/<name>`, opens its PR into `main`, and bumps the patch version and
adds its `CHANGELOG.md` entry in that same PR, because it never passes
through `release-pr.yml`. Merging it runs steps 4 and 5 above.

## What this repo ships

- `create-github-release.yml` runs `npm ci && npm run build && npm run package`, so the release builds the extension bundle and then packages it with `vsce package --no-dependencies --githubBranch main`.
- `--githubBranch main` points the README's relative links and screenshots at `main`, so the listing shows what was released rather than whatever is on `develop`. The screenshots are not in the `.vsix`; the listing loads them from GitHub.
- Every `./*.vsix` the package step produces is attached to the GitHub Release, and the same file is published to the VS Code Marketplace in that job, with the publisher credential `create-github-release.yml` passes in. Without one, the publish step logs a notice and skips. Nothing is published to npm or GitHub Packages.
- Because the package runs with `--no-dependencies`, `dist/extension.js` must already inline everything it needs; `esbuild.mjs`'s post-build guard is what catches a dependency that did not bundle.
- To install a release, install `chrisgriffinio.token-atlas` from the Marketplace, or download its `.vsix` and run `code --install-extension token-atlas-<version>.vsix --force`, then reload the window.

## Manual steps

None. Merging the `release/next` PR is the only human step: it tags, attaches the `.vsix` and publishes to the Marketplace.
