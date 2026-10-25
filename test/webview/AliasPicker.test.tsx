import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AliasPicker } from "../../src/webview/components/AliasPicker"
import { token } from "./fixtures"
import type { TokenNode, TokenType } from "../../src/core/types"

/**
 * What the picker decides: which tokens it offers for `currentPath` to alias,
 * and what a click hands back. `wouldCycle` itself is covered in core; here we
 * only pin that the picker applies it.
 */

afterEach(cleanup)

const color = (
  path: string[],
  value: unknown,
  extra: Partial<TokenNode> = {},
) => token(path, value, { type: "color" as TokenType, ...extra })

const current = ["color", "current"]

/** `loop` aliases the current token directly, `chain` aliases `loop`. */
const tokens = [
  color(current, "#111111"),
  color(["color", "other"], "#222222"),
  color(["color", "loop"], "{color.current}"),
  color(["color", "chain"], "{color.loop}"),
  token(["space", "md"], 16, { type: "number" as TokenType }),
]

function renderPicker(props: Partial<Parameters<typeof AliasPicker>[0]> = {}) {
  const onPick = vi.fn()
  const result = render(
    <AliasPicker
      tokens={tokens}
      currentPath={current}
      onPick={onPick}
      {...props}
    />,
  )
  return { ...result, onPick, offered: () => offered(result.container) }
}

/** The dotted path each offered row shows. */
const offered = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".row .mono")).map(
    el => el.firstChild?.textContent,
  )

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search tokens to reference…"), {
    target: { value },
  })

describe("AliasPicker candidates", () => {
  it("never offers the current token itself", () => {
    const { offered } = renderPicker()
    expect(offered()).not.toContain("color.current")
    expect(offered()).toContain("color.other")
  })

  it("excludes tokens whose selection would create a cycle, directly or through a chain", () => {
    const { offered } = renderPicker()
    expect(offered()).toEqual(["color.other", "space.md"])
  })

  it("filters by case-insensitive substring on the dotted path", () => {
    const { offered } = renderPicker()
    search("  SPACE.m ")
    expect(offered()).toEqual(["space.md"])
  })

  it("still applies the exclusions while a query is typed", () => {
    const { offered } = renderPicker()
    search("color")
    expect(offered()).toEqual(["color.other"])
  })

  it("shows the empty state when nothing matches", () => {
    const { offered } = renderPicker()
    search("nothing-matches-this")
    expect(offered()).toEqual([])
    expect(screen.getByText("No eligible tokens.")).toBeTruthy()
  })
})

describe("AliasPicker picking", () => {
  it("calls onPick with the dotted path, no braces", () => {
    const { onPick } = renderPicker()
    fireEvent.click(screen.getByText("color.other"))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith("color.other")
  })

  it("marks a candidate whose type differs from currentType as a mismatch", () => {
    renderPicker({ currentType: "color" as TokenType })
    const mismatch = screen.getByTitle("Type differs from this token")
    expect(mismatch.textContent).toBe("number")
    // Only the differing row is marked; the matching color row is not.
    expect(screen.getAllByTitle("Type differs from this token")).toHaveLength(1)
  })

  it("marks nothing when currentType is unset", () => {
    renderPicker()
    expect(screen.queryByTitle("Type differs from this token")).toBeNull()
  })
})

describe("AliasPicker keyboard", () => {
  const input = () => screen.getByRole("combobox")
  const key = (k: string) => fireEvent.keyDown(input(), { key: k })
  const highlighted = () =>
    screen
      .getAllByRole("option")
      .find(o => o.getAttribute("aria-selected") === "true")

  it("does not pick on the Enter that confirms an IME composition (#8)", () => {
    const { onPick } = renderPicker()
    fireEvent.keyDown(input(), { key: "Enter", isComposing: true })
    expect(onPick).not.toHaveBeenCalled()
  })

  it("moves the highlight with the arrows and picks it with Enter", () => {
    const { onPick } = renderPicker()
    search(".")
    key("ArrowDown")
    key("Enter")
    expect(onPick.mock.calls).toEqual([["space.md"]])
  })

  it("clamps the highlight to the list and moves back with ArrowUp", () => {
    renderPicker()
    key("ArrowUp")
    expect(highlighted()?.textContent).toContain("color.other")
    key("ArrowDown")
    key("ArrowDown")
    expect(highlighted()?.textContent).toContain("space.md")
    key("ArrowUp")
    expect(highlighted()?.textContent).toContain("color.other")
  })

  it("exposes the highlight as the search box's active option in a listbox", () => {
    renderPicker()
    key("ArrowDown")
    const active = highlighted()!
    expect(active.closest('[role="listbox"]')).toBeTruthy()
    expect(input().getAttribute("aria-activedescendant")).toBe(active.id)
    expect(
      screen
        .getAllByRole("option")
        .filter(o => o.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1)
  })

  it("returns the highlight to the first match when the query changes", () => {
    renderPicker()
    key("ArrowDown")
    search(".")
    expect(highlighted()?.textContent).toContain("color.other")
  })

  it("does nothing on Enter when nothing is offered", () => {
    const { onPick } = renderPicker()
    search("nothing-matches-this")
    key("Enter")
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe("AliasPicker row markers", () => {
  it("shows a swatch for a color and the type icon for anything else", () => {
    const { container } = renderPicker()
    const row = (path: string) =>
      [...container.querySelectorAll(".row")].find(
        r => r.querySelector(".mono")?.firstChild?.textContent === path,
      )!

    expect(row("color.other").querySelector(".swatch")).toBeTruthy()
    expect(row("color.other").querySelector(".type-icon")).toBeNull()
    expect(
      row("space.md").querySelector(".type-icon")?.getAttribute("data-type"),
    ).toBe("number")
    expect(row("space.md").querySelector(".swatch")).toBeNull()
  })

  it("draws no empty marker for an untyped token", () => {
    const { container } = renderPicker({ tokens: [token(["misc", "x"], "a")] })
    const marker = container.querySelector(".row")!.firstElementChild!
    expect(marker.classList.contains("mono")).toBe(true)
  })
})
