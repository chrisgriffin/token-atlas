# Tasks: Document the Open VSX publish in releasing.md

- [x] T001 `grep -c "Open VSX" docs/releasing.md` prints `0` on `develop` (red).
- [x] T002 `docs/releasing.md`: both registries, both secrets, the skip-with-notice behaviour, the Open VSX install and the old-id uninstall.
- [x] T003 `docs/architecture.md` and `CLAUDE.md` § Releasing: name Open VSX beside the Marketplace.
- [x] T004 The gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
