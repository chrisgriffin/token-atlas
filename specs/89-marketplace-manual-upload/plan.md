# Plan: docs/releasing.md says the Marketplace gets a manual .vsix upload once global PATs retire on 2026-12-01

## Technical context

- Prose only. `grep -rn "Marketplace" --include=*.md` outside `specs/` and `CHANGELOG.md` finds three passages that describe the Marketplace publish as automatic for every release: `docs/releasing.md` (opening line, § What this repo ships, § Manual steps), `CLAUDE.md` § Releasing and `docs/architecture.md`. All three are qualified in this change; `README.md`'s line names the `.vsix` for an editor without Marketplace access and stays true.
- § Manual steps is the `slot:manual` slot of the fleet `releasing.md` template, free text, so `Check docs/` is unaffected.
- PR #88 rewrites the two § What this repo ships bullets about the registries; this change adds a new bullet after them rather than editing them, so the two PRs touch separate lines.

## Surfaces touched

- `docs/releasing.md` — opening line, a new § What this repo ships bullet, § Manual steps (deleting the `VSCE_PAT` secret, then the upload)
- `CLAUDE.md` § Releasing — the publish sentence
- `docs/architecture.md` — the "Nothing depends on this repo as code" bullet
- none — no code, workflow, `package.json`, `.vscodeignore`, test, ruleset, vault note or published surface changes; no cost
