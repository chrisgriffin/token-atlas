# Spec: The gate stub passes RELEASE_PR_TOKEN so the gate can resolve a review thread

**Issue**: [#52](https://github.com/chrisgriffin/token-atlas/issues/52)

## Overview

This repo's `evaluator-gate.yml` stub passes its secrets by name. The gate replies on each inline finding thread with Autofix's answer and resolves the thread when every finding was fixed (ops#1919); only a user token may resolve a thread (ops#1914), so the reusable passes `TARGET_TOKEN || RELEASE_PR_TOKEN` to the gate for it (chrisgriffin/workflows#39). One line in the stub.

## Success criteria

- [x] The stub passes `TARGET_TOKEN: ${{ secrets.RELEASE_PR_TOKEN }}` beside its other named secrets: `TARGET_TOKEN` is the name the reusable at `v1` already declares, and a secret the callee does not declare fails the run at parse time (`startup_failure`). The callee's contract allows it: [chrisgriffin/workflows#40](https://github.com/chrisgriffin/workflows/pull/40) (`2814d4b`) rewords v1's `TARGET_TOKEN` description from "a target passes nothing here" to "a target that names its secrets passes RELEASE_PR_TOKEN here too", so this stub keeps the `TARGET_TOKEN` name after that PR ships and no switch to a by-name `RELEASE_PR_TOKEN` is owed.
- [x] **Runnable:** `grep -cF "TARGET_TOKEN: \${{ secrets.RELEASE_PR_TOKEN }}" .github/workflows/evaluator-gate.yml` prints `1` (prints `0` on `develop`).

## Corrections

- Success criterion 1 now cites the callee contract that allows a target to pass `TARGET_TOKEN` (Evaluator round 0 on [#53](https://github.com/chrisgriffin/token-atlas/pull/53): v1's description reserved the name for ops, and nothing said the stub could keep it). The requirement is unchanged; its premise is now stated against the amended contract in chrisgriffin/workflows#40.

## Needs from Chris

none
