/** The listing every workflow test reads: no `.yaml` file is committed, so this is what proves one would be read. */
import { describe, it, expect } from "vitest"
import { isWorkflowFile } from "./workflows"

describe("isWorkflowFile — the extensions GitHub runs from .github/workflows/", () => {
  it.each(["probe.yaml", "x.yml"])("reads %s", name => {
    expect(isWorkflowFile(name)).toBe(true)
  })

  it.each(["x.json", "x.yml.bak", "yaml", "README.md"])("skips %s", name => {
    expect(isWorkflowFile(name)).toBe(false)
  })
})
