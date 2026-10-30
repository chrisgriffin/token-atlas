# Plan: The gate stub passes RELEASE_PR_TOKEN so the gate can resolve a review thread

## Technical context

- The stub is a thin `uses:` on `chrisgriffin/workflows/.github/workflows/_reusable-evaluator-gate.yml@v1`, secrets by name; the secret already exists on this repo.

## Surfaces touched

- `.github/workflows/evaluator-gate.yml`: one named secret added, under the `TARGET_TOKEN` name the reusable declares at `v1` (an undeclared secret is a parse error, so the stub cannot pass `RELEASE_PR_TOKEN` by name at `v1`, and with chrisgriffin/workflows#40 the `TARGET_TOKEN` name stays the one a named-secrets target uses). Nothing else reads it here. The reusable's side is chrisgriffin/workflows#39. At `v1` the value is not unused: the reusable passes `ops-token: ${{ secrets.OPS_GH_TOKEN || secrets.TARGET_TOKEN }}`, so from this merge on `RELEASE_PR_TOKEN` is the fallback for checking out ops, and an empty or expired `OPS_GH_TOKEN` no longer turns the job red but checks ops out with this write-scoped user token. chrisgriffin/workflows#40 keeps that fallback and adds `target-token: ${{ secrets.TARGET_TOKEN || secrets.RELEASE_PR_TOKEN }}`, so once it is on `v1` the value also reaches the gate, which resolves the thread with it. (Corrected after the Evaluator's round-0 verdict on #53: this line used to say the gate ignores the value until the tag moves.)
