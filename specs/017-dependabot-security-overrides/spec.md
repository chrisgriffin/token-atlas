# Spec: Pin patched serialize-javascript and @azure/msal-node through overrides

**Feature Branch**: `017-dependabot-security-overrides`
**Issue**: [#34](https://github.com/chrisgriffin/token-atlas/issues/34)

## Overview

Dependabot's security update for `serialize-javascript` and `@azure/msal-node` fails every run, so the vulnerable versions stay in the lockfile. Both are transitive dev dependencies whose parents pin a vulnerable range: `mocha@11` (under `@vscode/test-cli`) asks for `serialize-javascript ^6.0.2`, and `@azure/identity` (under `@vscode/vsce`) asks for `@azure/msal-node ^5.1.0`; no published parent version allows a patched one. An `overrides` entry for each holds every copy at a patched version.

## User scenarios

1. **Given** a fresh `npm ci`, **When** `npm ls serialize-javascript @azure/msal-node` runs, **Then** every copy is a patched version (`serialize-javascript >=7.1.3`, `@azure/msal-node >=7.1.0`).
2. **Given** someone drops an override or regenerates the lockfile without it, **When** `npm test` runs, **Then** `test/ci/security-overrides.test.ts` fails naming the vulnerable copy.

## Functional requirements

- **FR-001**: `package.json` `overrides` sets `serialize-javascript` to `^7.1.4` and `@azure/msal-node` to `^7.1.1`; `package-lock.json` is regenerated with them.
- **FR-002**: a `test/ci/` test fails when any locked copy of either package is below its first patched version.
- **FR-003**: the build gate stays green, including the integration suite that runs on mocha.

## Success criteria

- [ ] **Runnable:** `gh api "repos/chrisgriffin/token-atlas/dependabot/alerts?state=open&ecosystem=npm" --jq '[.[] | select(.dependency.package.name=="serialize-javascript" or .dependency.package.name=="@azure/msal-node")] | length'` prints `0`.
- [ ] `npm ls serialize-javascript @azure/msal-node` on `develop` resolves every copy to a version that is not affected by an open advisory.
- [ ] after-merge: token-atlas's next Dependabot npm update run concludes `success`, and the incident ledger records no new failure for this update.
- [ ] `npm run verify` (or the repo's CI) stays green with the new versions.

## Out of scope

- The other open `npm audit` findings (`diff` under mocha, `qs`) — not in this issue's contract.

## Needs from Chris

none
