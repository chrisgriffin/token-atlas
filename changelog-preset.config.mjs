// Changelog preset config for conventional-changelog-cli.
// Wraps the `conventionalcommits` preset and overrides the `types` list so
// every conventional-commit type gets its own section in CHANGELOG.md and
// the release PR body — instead of the angular preset's default
// (feat/fix/perf only, plus reverts).
//
// Used by .github/workflows/release-pr.yml. Pass via
// `-n ./changelog-preset.config.mjs` (without `-p`, since the preset is
// loaded inside this file). Using `-p` alongside `-n` would cause
// conventional-changelog to overwrite this config with the bare preset.
//
// Version bumps are computed separately by `conventional-recommended-bump
// -p conventionalcommits` (see the `version:recommend` npm script) — chore/
// docs/style/ci/refactor/test/build do NOT trigger a release on their own,
// they ride along with the next feat/fix/perf bump and show up in the
// changelog under their own sections.

import createPreset from "conventional-changelog-conventionalcommits"

const preset = await createPreset({
  types: [
    { type: "feat", section: "Features" },
    { type: "fix", section: "Bug Fixes" },
    { type: "perf", section: "Performance Improvements" },
    { type: "revert", section: "Reverts" },
    { type: "refactor", section: "Code Refactoring" },
    { type: "docs", section: "Documentation" },
    { type: "style", section: "Styles" },
    { type: "test", section: "Tests" },
    { type: "build", section: "Build System" },
    { type: "ci", section: "Continuous Integration" },
    { type: "chore", section: "Chores" },
  ],
})

// GitHub auto-closes any issue that follows a closing keyword
// (close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved) in a
// commit message or PR body once it lands on the default branch (`main`).
// conventional-changelog, however, renders EVERY issue reference it parses
// — including bare `#N` mentions with no keyword — as a "closes #N" clause.
// Because every push to `develop` flows to `main` through the rolling
// release PR, those fabricated references would reach `main` and could be
// mistaken for closing references. Restore GitHub's own semantics: a
// closing keyword closes the issue; a plain mention does not. The parser
// sets `action` to the matched keyword for those; bare mentions have a
// null `action`.
const baseTransform = preset.writer.transform

preset.writer.transform = (commit, context) => {
  const transformed = baseTransform ? baseTransform(commit, context) : commit
  if (transformed && Array.isArray(transformed.references)) {
    transformed.references = transformed.references.filter(ref => ref.action)
  }
  return transformed
}

export default preset
