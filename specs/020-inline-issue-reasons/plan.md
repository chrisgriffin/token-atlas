# Plan: Comments and docs give the reason in words instead of citing issue numbers from another tracker

## Technical context

- Comment and doc text only; no code path, test assertion or manifest entry
  changes.
- Prettier owns wrapping; the edited comments stay within the surrounding
  line width.

## Design decisions

1. **Drop the number where the sentence already gives the reason**
   (most `exercised inside a real VS Code (#NNN)` headers).
2. **Replace it with the reason where the number carried meaning**: the
   strictly-opt-in quick fixes, the identifier half covered by
   `manifest-couplings.test.ts`, the drop `fixAt` retries past, the behaviour
   before `computeAddEdits`/`computeDeleteEdits`.
3. **ADR-001** says it was implemented before the move, under an issue in a
   tracker that is not public, instead of linking a missing issue.
4. **`CLAUDE.md` invariant 2** states the failure itself (installs, then fails
   to activate) instead of a version this repo never released.

## Surfaces touched

- `CLAUDE.md` invariant 2 — reworded, rule unchanged
- `docs/design.md` § format-preserving writes and `docs/adr/ADR-001` — prose only; the ADR index row is unchanged
- none — no `package.json`, `.vscodeignore`, workflow job, `dependencies`/`mainFields` or published surface changes; no new directory, so `docs/architecture.md` is unchanged; no vault note covers these paths

## Risk

None to behaviour. The risk is a comment losing its reason; each rewrite
keeps or states it.
