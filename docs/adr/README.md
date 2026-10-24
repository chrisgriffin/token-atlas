# Decision records

This folder records the decisions this repo's own PRs implement, so each one
travels with the code it shaped.

Each record is `ADR-NNN-<slug>.md`, numbered in order within this repo. It
opens with YAML frontmatter carrying `status` (`proposed`, `accepted`,
`superseded` or `deprecated`), `date`, and `superseded-by: ADR-NNN` when it
has a successor; then `# ADR-NNN: <title>`; then `## Context`,
`## Decision` and `## Consequences`, in that order.

## Records

| ADR                                                  | Date       | Status   | Decision                                                                                 |
| ---------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| [ADR-001](./ADR-001-exported-identifier-matching.md) | 2026-09-07 | accepted | Match an exported identifier to a token by normalized name, with no export config.       |
| [ADR-002](./ADR-002-js-style-property-names.md)      | 2026-10-24 | proposed | In JS/TS, a DOM style property name counts as a token only when the file imports it.     |
| [ADR-003](./ADR-003-deprecation-replacement.md)      | 2026-10-24 | proposed | A deprecated token's replacement is the first `{reference}` in its `$deprecated` reason. |
