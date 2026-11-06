/** The release workflows are thin stubs calling chrisgriffin/workflows at v1 with named secrets. */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const WORKFLOWS = join(here, "../../.github/workflows")

function wf(name: string): string {
  return readFileSync(join(WORKFLOWS, `${name}.yml`), "utf8")
}

describe("sync-main-to-develop.yml — trigger stub", () => {
  it("triggers on push to main", () => {
    expect(wf("sync-main-to-develop")).toMatch(/^ {4}branches: \[main\]$/m)
  })

  it("calls the public reusable workflow at v1 and names the one secret it passes", () => {
    const text = wf("sync-main-to-develop")
    expect(text).toContain(
      "uses: chrisgriffin/workflows/.github/workflows/_reusable-sync-main-to-develop.yml@v1",
    )
    expect(text).toMatch(
      /^ {4}secrets:\n {6}RELEASE_PR_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}$/m,
    )
    expect(text).not.toContain("secrets: inherit")
  })
})

describe("release-pr.yml — trigger stub", () => {
  it("triggers on push to develop and calls the public reusable workflow at v1 by named secrets", () => {
    const text = wf("release-pr")
    expect(text).toContain("- develop")
    expect(text).toContain(
      "uses: chrisgriffin/workflows/.github/workflows/_reusable-release-pr.yml@v1",
    )
    expect(text).toMatch(
      /^ {4}secrets:\n {6}RELEASE_PR_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}\n {6}OPS_GH_TOKEN: \$\{\{ secrets\.OPS_GH_TOKEN \}\}$/m,
    )
    expect(text).not.toContain("secrets: inherit")
  })

  it("grants the callee the write scopes the deleted body declared", () => {
    const text = wf("release-pr")
    expect(text).toMatch(/^ {4}permissions:\n {6}contents: write$/m)
    expect(text).toMatch(/^ {6}pull-requests: write$/m)
  })
})

describe("create-github-release.yml — trigger stub", () => {
  it("passes both registry tokens by name: VSCE_PAT for the Marketplace, OVSX_PAT for Open VSX", () => {
    const text = wf("create-github-release")
    expect(text).toContain(
      "uses: chrisgriffin/workflows/.github/workflows/_reusable-create-github-release.yml@v1",
    )
    expect(text).toMatch(
      /^ {4}secrets:\n {6}VSCE_PAT: \$\{\{ secrets\.VSCE_PAT \}\}\n {6}OVSX_PAT: \$\{\{ secrets\.OVSX_PAT \}\}$/m,
    )
    expect(text).not.toContain("secrets: inherit")
  })
})
