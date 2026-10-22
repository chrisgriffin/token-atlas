---
status: accepted
date: 2026-09-07
---

# ADR-001: Match exported identifiers to tokens by normalized name, not by export config

Implemented by [#108](https://github.com/chrisgriffin/token-atlas/issues/108).

## Context

Token Atlas explains a token where it is defined (the DTCG JSON). Developers
spend most of their time where it is _used_: `var(--color-brand-primary)` in
CSS, `$color-brand-primary` in Sass, `tokens.color.brand.primary` or
`colorBrandPrimary` in JS/TS. Those names are produced by an export tool
(Style Dictionary, Terrazzo, a hand-rolled script), each with its own casing,
separator, and prefix rules, and Token Atlas has no way to know which one a
workspace uses.

## Decision

Match by **normalized name**: lowercase, keep only letters and digits, on both
the identifier under the cursor and every token path in the workspace index.
`color.brand.primary`, `--color-brand-primary`, `colorBrandPrimary`, and
`COLOR_BRAND_PRIMARY` all normalize to `colorbrandprimary`.

If nothing matches, drop the identifier's leading segments one at a time
(split on separators and camelCase boundaries) and retry, so
`--ds-color-brand-primary` and `theme.tokens.colorBrandPrimary` still resolve
without a prefix setting. An exact match always wins over a stripped one.

The matcher is pure (`src/core/exportNames.ts`); the host
(`src/host/exportFeatures.ts`) only extracts the word under the cursor and
reads the workspace index. A miss returns no hover and no definition, so
ordinary CSS/JS is untouched.

## Consequences

- No configuration. Every common export shape works on install.
- Two token paths that differ only in separators (`color.brand-primary` vs
  `color.brandPrimary`) collide; the first indexed wins. This has not been
  seen in a real token set and is not worth a setting until it is.
- Bracket access (`tokens["color"]["brand"]`) and template-built names are
  not matched. The word-range regex is the upgrade point if that need arrives.
- Indexes are small (hundreds to low thousands of paths), so building the
  normalized map per hover is cheap. Cache it on the index if that changes.
