# Plan: The gate stub passes RELEASE_PR_TOKEN so the gate can resolve a review thread

## Technical context

- The stub is a thin `uses:` on `chrisgriffin/workflows/.github/workflows/_reusable-evaluator-gate.yml@v1`, secrets by name; the secret already exists on this repo.

## Surfaces touched

- `.github/workflows/evaluator-gate.yml`: one named secret added, under the `TARGET_TOKEN` name the reusable declares at `v1` (an undeclared secret is a parse error, so `RELEASE_PR_TOKEN` by name must wait for the tag to move). Nothing else reads it here. The reusable's side is chrisgriffin/workflows#39; until its `v1` tag moves the gate ignores the value.
