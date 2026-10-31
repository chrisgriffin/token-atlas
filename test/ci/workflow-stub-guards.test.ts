/** Each workflow is a thin stub calling a reusable workflow in chrisgriffin/workflows; these pin the guards and grants that must live in the stub itself. */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const WORKFLOWS = join(here, "../../.github/workflows")

function wf(name: string): string {
  return readFileSync(join(WORKFLOWS, `${name}.yml`), "utf8")
}

/** The stub's single job block, comments stripped. */
function job(name: string): string {
  return wf(name)
    .split(/\njobs:\n/)[1]
    .split("\n")
    .filter(line => !line.trim().startsWith("#"))
    .join("\n")
}

describe("stub permissions — a called workflow cannot elevate past its caller", () => {
  it("claude-mention grants what the 👀 reaction ack needs, at the workflow level", () => {
    expect(wf("claude-mention")).toMatch(
      /^permissions:\n {2}issues: write\n {2}pull-requests: write$/m,
    )
  })

  it("sync-main-to-develop grants the push and the conflict-path PR", () => {
    const text = job("sync-main-to-develop")
    expect(text).toMatch(/^ {6}contents: write$/m)
    expect(text).toMatch(/^ {6}pull-requests: write$/m)
  })

  it("create-github-release grants contents: write for the release + tag", () => {
    expect(job("create-github-release")).toMatch(/^ {6}contents: write$/m)
  })

  it("build-check grants contents + the packages read its callee requires", () => {
    const text = job("build-check")
    expect(text).toMatch(/^ {6}contents: read\n {6}packages: read$/m)
    expect(text).not.toContain("write")
  })

  it("evaluator-gate grants exactly what the dispatcher's comment reads/writes and status write need", () => {
    expect(wf("evaluator-gate")).toMatch(
      /^permissions:\n {2}contents: read\n {2}issues: write\n {2}pull-requests: write\n {2}statuses: write\n\n/m,
    )
  })
})

describe("stub guards — the `if:` has to fire before the call, not inside it", () => {
  it("claude-mention has no bot-sender or @claude guard of its own — that's the callee's job now", () => {
    expect(job("claude-mention")).not.toContain("if:")
  })

  it("create-github-release fires on a merged PR and leaves the branch policy to the called workflow", () => {
    const text = job("create-github-release")
    expect(text).toContain("github.event.pull_request.merged == true")

    expect(text).not.toContain("startsWith(github.event.pull_request.head.ref")
  })

  it("build-check skips drafts, on push always runs", () => {
    const text = job("build-check")
    expect(text).toContain(
      "github.event_name == 'push' || github.event.pull_request.draft == false",
    )
  })

  it("build-check fires on ready_for_review — the guard above is only safe with this", () => {
    expect(wf("build-check")).toContain(
      "types: [opened, synchronize, reopened, ready_for_review]",
    )
  })

  it("evaluator-gate carries no logic — the guard lives in the called workflow", () => {
    const text = job("evaluator-gate")
    expect(text).not.toContain("github.event.comment.user.login")
    expect(text).not.toMatch(/^\s*if:/m)
  })

  it("evaluator-gate re-runs on an EDITED comment — that is how the loop reports", () => {
    expect(wf("evaluator-gate")).toMatch(
      /issue_comment:\n\s+types: \[created, edited\]/,
    )
  })

  it("evaluator-gate's only triggers are pull_request and issue_comment — no workflow_run, no pull_request_review", () => {
    expect(wf("evaluator-gate")).not.toContain("workflow_run")
    expect(wf("evaluator-gate")).not.toContain("pull_request_review")
    expect(wf("evaluator-gate")).toMatch(
      /^on:\n {2}pull_request:\n {4}types: \[opened, reopened, ready_for_review, converted_to_draft, synchronize\]\n/m,
    )
  })

  it("evaluator-gate's job is named evaluator — the check-run reads `evaluator / gate`", () => {
    expect(job("evaluator-gate")).toMatch(/^ {2}evaluator:$/m)
  })
})

describe("every stub calls the public workflows repo at v1, by named secrets", () => {
  for (const file of readdirSync(WORKFLOWS).filter(f => f.endsWith(".yml"))) {
    it(`${file} uses chrisgriffin/workflows@v1, not a private repo or @develop`, () => {
      const text = readFileSync(join(WORKFLOWS, file), "utf8")
      expect(text).toMatch(
        /^ {4}uses: chrisgriffin\/workflows\/\.github\/workflows\/_reusable-[a-z-]+\.yml@v1$/m,
      )
      expect(text).not.toMatch(/^ {4}uses: chrisgriffin\/ops\//m)
      expect(text).not.toMatch(/@develop$/m)
    })

    it(`${file} passes secrets by name, never inherit`, () => {
      const text = job(file.replace(/\.yml$/, ""))
      expect(text).not.toContain("secrets: inherit")
      expect(text).toMatch(
        /^ {4}secrets:\n {6}[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/m,
      )
    })
  }
})

/**
 * `build-check.yml` and a second workflow, `ci.yml`, once ran the same gate —
 * checkout, Node 20, `npm ci`, format:check, typecheck, test, build — under two
 * job names, `build` and `check`, both firing on every `pull_request`. Every PR
 * was billed twice for identical work for as long as that lasted. ci.yml is
 * gone and the `check` entry came off the ruleset with it; these assertions are
 * what stops a second copy growing back, and what pins the two halves the
 * ruleset actually depends on.
 */
describe("build-check is this repo's one CI gate", () => {
  it("carries the whole gate chain into the called workflow", () => {
    const text = job("build-check")
    for (const command of [
      "npm run format:check",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
    ]) {
      expect(text, `gate chain is missing \`${command}\``).toContain(command)
    }
  })

  it("reports as build / ci — no mirror job, the ruleset requires the two-part name directly", () => {
    const text = job("build-check")
    expect(text).toMatch(/^ {2}build:$/m)
    expect(text).toContain("uses: chrisgriffin/workflows")
    expect(text).not.toContain("needs: call")
    const ids = [...text.matchAll(/^ {2}([\w-]+):$/gm)].map(m => m[1])
    expect(ids).toEqual(["build"])
  })

  it("is the only workflow that runs the gate", () => {
    const duplicates = readdirSync(WORKFLOWS).filter(
      file =>
        file.endsWith(".yml") &&
        file !== "build-check.yml" &&
        readFileSync(join(WORKFLOWS, file), "utf8").includes(
          "npm run typecheck",
        ),
    )
    expect(
      duplicates,
      "a second workflow runs the same gate — that is the ci.yml duplication again",
    ).toEqual([])
  })
})
