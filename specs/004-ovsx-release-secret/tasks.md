# Tasks: Pass the Open VSX token to the release workflow

- [x] T001 `test/ci/workflow-stubs.test.ts`: pin `VSCE_PAT` and `OVSX_PAT` passed by name; red on `develop`.
- [x] T002 `.github/workflows/create-github-release.yml`: pass `OVSX_PAT`.
- [x] T003 The gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
- [ ] T004 (after merge) Merged after the workflows release that moves `v1` past chrisgriffin/workflows#18; with `OVSX_PAT` set, the next release publishes to Open VSX.
