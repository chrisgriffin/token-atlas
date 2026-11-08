# Implementation Plan: Pin patched serialize-javascript and @azure/msal-node through overrides

**Branch**: `017-dependabot-security-overrides` | **Spec**: [spec.md](./spec.md)

## Summary

Add two `overrides` entries, regenerate the lockfile, and pin the result with a lockfile test.

## Technical context

- Dev-only: both packages sit under devDependencies (`@vscode/test-cli`, `@vscode/vsce`); nothing reaches `dist/`, so invariant 2 is untouched.
- `serialize-javascript` 6 → 7: 7.x needs Node >=20 (CI runs 22); mocha uses it only to serialize results in parallel mode. The integration suite (mocha) passes.
- `@azure/msal-node` 5 → 7: used only by `@azure/identity`'s Entra ID login in `vsce`. Releases publish with `VSCE_PAT` (`docs/releasing.md`), so that path is not exercised; `@azure/identity` still loads and constructs credentials, and `vsce package` succeeds.
- No parent upgrade fixes either: `@azure/identity@4.14.0` asks for `msal-node ^6` (still affected), and `mocha@12` (fixed) is outside `@vscode/test-cli@0.0.15`'s `^11.7.6`.
- Test: `test/ci/security-overrides.test.ts` reads `package-lock.json` and fails on any copy below the first patched version (red on `develop`, 2/2).

## Surfaces touched

- `package.json` / `package-lock.json` — the `overrides` block and the regenerated lock.
- `test/ci/security-overrides.test.ts` — the pin.
- `docs/testing.md` — the `test/ci/` list names the new guard.
- Fleet surfaces: none — no Routine, plugin, reusable workflow, published surface, ruleset or directory change.
