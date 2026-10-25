import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Issues } from "../../src/webview/components/Issues"
import type { ValidationResult } from "../../src/core/types"

/**
 * Smoke test for the jsdom environment: the first webview component rendered in
 * the suite at all. `Issues` is the smallest one, and its two branches — a
 * folded status line, or nothing when there is nothing to report — are enough
 * to prove a component mounts and produces DOM.
 */

// Vitest runs without `globals`, so testing-library's auto-cleanup never
// registers; unmount between tests explicitly or the renders accumulate.
afterEach(cleanup)

const result = (issues: ValidationResult["issues"]): ValidationResult => ({
  issues,
})

describe("Issues", () => {
  it("summarises errors and warnings for a non-empty list", () => {
    render(
      <Issues
        validation={result([
          {
            severity: "error",
            path: ["color", "brand"],
            message: "unresolved reference",
          },
          {
            severity: "error",
            path: ["color", "accent"],
            message: "reference cycle",
          },
          {
            severity: "warning",
            path: ["space", "sm"],
            message: "duplicate path",
          },
        ])}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByText("2 errors")).toBeDefined()
    expect(screen.getByText("1 warning")).toBeDefined()
  })

  it("renders nothing for an empty list", () => {
    const { container } = render(
      <Issues validation={result([])} onSelect={() => {}} />,
    )

    expect(container.innerHTML).toBe("")
  })
})

describe("Issues keyboard", () => {
  const issues = result([
    {
      severity: "error",
      path: ["color", "brand"],
      message: "unresolved reference",
    },
    { severity: "warning", path: ["space", "sm"], message: "duplicate path" },
  ])

  /** Focus a control and activate it. A native button turns Enter and Space
   *  into a click in a browser; jsdom does not, so the click stands in. */
  const activate = (el: HTMLElement) => {
    el.focus()
    expect(document.activeElement).toBe(el)
    fireEvent.click(el)
  }

  it("opens from the summary and selects a problem, all through focusable buttons", () => {
    const onSelect = vi.fn()
    render(<Issues validation={issues} onSelect={onSelect} />)

    const summary = screen.getByRole("button", { name: /2 problems|1 error/ })
    expect(summary.getAttribute("aria-expanded")).toBe("false")

    activate(summary)
    expect(summary.getAttribute("aria-expanded")).toBe("true")

    activate(screen.getByRole("button", { name: /unresolved reference/ }))
    expect(onSelect.mock.calls).toEqual([[["color", "brand"]]])

    activate(summary)
    expect(summary.getAttribute("aria-expanded")).toBe("false")
    expect(
      screen.queryByRole("button", { name: /unresolved reference/ }),
    ).toBeNull()
  })

  it("draws the open/closed arrow as the chevron icon, not a text character", () => {
    const { container } = render(
      <Issues validation={issues} onSelect={() => {}} />,
    )
    const summary = screen.getByRole("button", { name: /1 error/ })

    expect(summary.querySelector(".chevron svg")).toBeTruthy()
    expect(container.textContent).not.toMatch(/[▴▾]/)
  })
})
