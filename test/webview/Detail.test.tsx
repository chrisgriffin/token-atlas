import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { Detail } from "../../src/webview/components/Detail"
import type { TokenNode, TokenType } from "../../src/core/types"
import { token } from "./fixtures"

/**
 * The detail panel is where every value, rename, description, type and
 * deprecation edit is made, and each one is a callback it must fire once with
 * the right argument.
 */

afterEach(cleanup)

const handlers = () => ({
  onChangeValue: vi.fn(),
  onChangeDescription: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onClose: vi.fn(),
  onChangeDeprecated: vi.fn(),
  onChangeType: vi.fn(),
})

function renderDetail(
  node: TokenNode,
  extra: Partial<ReturnType<typeof handlers>> = {},
  others: TokenNode[] = [],
) {
  const props = { ...handlers(), ...extra }
  render(
    <Detail
      token={node}
      allTokens={[node, ...others]}
      externalTokens={[]}
      {...props}
    />,
  )
  return props
}

const picker = () =>
  screen.queryByPlaceholderText("Search tokens to reference…")
const linkButton = () => screen.getByRole("button", { name: "Link to token" })
const unlinkButton = () =>
  screen.getByRole("button", { name: "Unlink from token" })

const plain = () =>
  token(
    ["color", "brand", "primary"],
    { colorSpace: "srgb", components: [0, 0, 0] },
    {
      type: "color" as TokenType,
    },
  )

const alias = () =>
  token(["color", "brand", "accent"], "{color.brand.primary}", {
    type: "color" as TokenType,
    resolvedValue: { colorSpace: "srgb", components: [0, 0, 0] },
    resolvedType: "color" as TokenType,
  })

describe("Detail", () => {
  it("shows a plain token's own editor, with no alias UI in the way", () => {
    renderDetail(plain())
    // One Value section: the colour editor, and a button to reference a token.
    expect(screen.getByLabelText("Pick color")).toBeTruthy()
    expect(linkButton()).toBeTruthy()
    expect(picker()).toBeNull()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
  })

  it("shows an alias as its reference, resolved, in the same place", () => {
    renderDetail(alias())
    expect(screen.getByText("color.brand.primary")).toBeTruthy()
    expect(unlinkButton()).toBeTruthy()
    // The value editor belongs to the token it points at, not to this one.
    expect(screen.queryByLabelText("Pick color")).toBeNull()
    expect(picker()).toBeNull()
  })

  it("opens the token list from the link button, for a plain token", () => {
    const props = renderDetail(plain())
    fireEvent.click(linkButton())
    expect(picker()).toBeTruthy()
    expect(props.onChangeValue).not.toHaveBeenCalled()
  })

  it("opens the token list by clicking the reference itself", () => {
    renderDetail(alias())
    fireEvent.click(
      screen.getByRole("button", { name: /color\.brand\.primary/ }),
    )
    expect(picker()).toBeTruthy()
  })

  it("writes the reference the picker chose", () => {
    // A token can't reference itself, so the list needs someone else in it.
    const props = renderDetail(plain(), {}, [
      token(
        ["color", "base", "white"],
        { colorSpace: "srgb", components: [1, 1, 1] },
        {
          type: "color" as TokenType,
        },
      ),
    ])
    fireEvent.click(linkButton())
    fireEvent.click(screen.getByText("color.base.white"))
    expect(props.onChangeValue).toHaveBeenCalledWith("{color.base.white}")
    expect(picker()).toBeNull()
  })

  it("unlinking keeps the value the alias resolved to", () => {
    const props = renderDetail(alias())
    fireEvent.click(unlinkButton())
    expect(props.onChangeValue).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [0, 0, 0],
    })
  })

  it("renames on blur, once, with the name trimmed", () => {
    const props = renderDetail(plain())
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    const input = screen.getByDisplayValue("primary")
    fireEvent.change(input, { target: { value: "  secondary  " } })
    fireEvent.blur(input)
    expect(props.onRename.mock.calls).toEqual([["secondary"]])
  })

  it("does not rename when the name is unchanged", () => {
    const props = renderDetail(plain())
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    fireEvent.blur(screen.getByDisplayValue("primary"))
    expect(props.onRename).not.toHaveBeenCalled()
  })

  it("does not rename when the name is emptied", () => {
    const props = renderDetail(plain())
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    const input = screen.getByDisplayValue("primary")
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.blur(input)
    expect(props.onRename).not.toHaveBeenCalled()
  })

  it("marks a token deprecated", () => {
    const props = renderDetail(plain())
    fireEvent.click(screen.getByLabelText("Mark as deprecated"))
    expect(props.onChangeDeprecated).toHaveBeenCalledWith(true)
  })

  it("disables Unlink for an alias that does not resolve, so it never writes nothing (#8)", () => {
    const props = renderDetail(
      token(["x"], "{missing.token}", { type: "color" as TokenType }),
    )
    expect((unlinkButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(unlinkButton())
    expect(props.onChangeValue).not.toHaveBeenCalled()
  })

  it("starts a rename from the keyboard: the name is a button (#8)", () => {
    const props = renderDetail(plain())
    const name = within(screen.getByRole("heading", { level: 2 })).getByRole(
      "button",
    )
    expect(name.textContent).toBe("primary")
    fireEvent.click(name)
    const input = screen.getByDisplayValue("primary")
    fireEvent.change(input, { target: { value: "secondary" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onRename.mock.calls).toEqual([["secondary"]])
  })

  it("keeps the rename box open on Enter when the name is refused (#8)", () => {
    renderDetail(plain(), { onRename: vi.fn(() => false) })
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    const input = screen.getByDisplayValue("primary")
    fireEvent.change(input, { target: { value: "taken" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.getByDisplayValue("taken")).toBeTruthy()
  })

  it("ignores the Enter that confirms an IME composition in the rename box (#8)", () => {
    const props = renderDetail(plain())
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    const input = screen.getByDisplayValue("primary")
    fireEvent.change(input, { target: { value: "にほ" } })
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(props.onRename).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue("にほ")).toBeTruthy()
  })

  it("cancels a rename on Escape without the key reaching the panel (#8)", () => {
    const outer = vi.fn()
    const props = handlers()
    render(
      <div onKeyDown={e => outer(e.key)}>
        <Detail token={plain()} allTokens={[]} externalTokens={[]} {...props} />
      </div>,
    )
    fireEvent.click(screen.getByRole("heading", { level: 2 }))
    fireEvent.keyDown(screen.getByDisplayValue("primary"), { key: "Escape" })
    expect(outer).not.toHaveBeenCalled()
    expect(props.onRename).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue("primary")).toBeNull()
  })
})

describe("Detail value edits", () => {
  const number = (v: number) => token(["n"], v, { type: "number" as TokenType })
  const others = () => ({ allTokens: [], externalTokens: [] })

  it("Edit as JSON follows a value that changes while it is untouched (#8)", () => {
    const props = handlers()
    const { rerender } = render(
      <Detail token={number(1)} {...others()} {...props} />,
    )
    rerender(<Detail token={number(5)} {...others()} {...props} />)
    expect(
      (document.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe("5")
    fireEvent.click(screen.getByText("Save value"))
    expect(props.onChangeValue).toHaveBeenCalledWith(5)
  })

  it("Edit as JSON refuses to save over a value that changed under an edit (#8)", () => {
    const props = handlers()
    const { rerender } = render(
      <Detail token={number(1)} {...others()} {...props} />,
    )
    const box = () => document.querySelector("textarea") as HTMLTextAreaElement
    fireEvent.change(box(), { target: { value: "2" } })
    rerender(<Detail token={number(5)} {...others()} {...props} />)
    expect(box().value).toBe("2")
    expect(screen.getByText(/changed since/)).toBeTruthy()
    expect((screen.getByText("Save value") as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByText("Reload"))
    expect(box().value).toBe("5")
    expect(props.onChangeValue).not.toHaveBeenCalled()
  })

  it("Edit as JSON saves an edit and then follows the value it saved (#8)", () => {
    const props = handlers()
    const { rerender } = render(
      <Detail token={number(1)} {...others()} {...props} />,
    )
    const box = () => document.querySelector("textarea") as HTMLTextAreaElement
    fireEvent.change(box(), { target: { value: "2" } })
    fireEvent.click(screen.getByText("Save value"))
    rerender(<Detail token={number(2)} {...others()} {...props} />)
    expect(screen.queryByText(/changed since/)).toBeNull()
    rerender(<Detail token={number(7)} {...others()} {...props} />)
    expect(box().value).toBe("7")
    expect(props.onChangeValue.mock.calls).toEqual([[2]])
  })

  it("builds a second edit on the first when both land before the host replies (#8)", () => {
    const props = renderDetail(
      token(
        ["s"],
        {
          color: { colorSpace: "srgb", components: [0, 0, 0] },
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 2, unit: "px" },
          blur: { value: 4, unit: "px" },
          spread: { value: 0, unit: "px" },
        },
        { type: "shadow" as TokenType },
      ),
    )
    const blur = screen.getAllByRole("spinbutton")[2]
    fireEvent.focus(blur)
    fireEvent.change(blur, { target: { value: "12" } })
    fireEvent.blur(blur)
    fireEvent.click(screen.getByLabelText("Inset", { selector: "input" }))
    expect(props.onChangeValue.mock.lastCall![0]).toMatchObject({
      blur: { value: 12, unit: "px" },
      inset: true,
    })
  })
})
