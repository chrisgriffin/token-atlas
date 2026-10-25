import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { InlineCell } from "../../src/webview/components/InlineCell"
import "../../src/webview/styles"

/**
 * A long token name stays editable in a narrow Name column (spec 057): the
 * rename input grows to fit its text instead of scrolling inside the column.
 */
afterEach(cleanup)

describe("Name column", () => {
  it("grows the rename input with its text", () => {
    const { container } = render(
      <InlineCell grow text="hovered" commit={vi.fn(() => true)} />,
    )
    fireEvent.focus(container.querySelector(".cell")!)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.classList).toContain("grow")
    expect(input.style.width).toBe(`${"hovered".length + 3}ch`)
    fireEvent.change(input, {
      target: { value: "hovered-with-a-much-longer-name" },
    })
    expect(input.style.width).toBe(
      `${"hovered-with-a-much-longer-name".length + 3}ch`,
    )
  })

  it("leaves other inline cells at the column width", () => {
    const { container } = render(
      <InlineCell text="16px" commit={vi.fn(() => true)} />,
    )
    fireEvent.focus(container.querySelector(".cell")!)
    expect((screen.getByRole("textbox") as HTMLInputElement).style.width).toBe(
      "",
    )
  })
})
