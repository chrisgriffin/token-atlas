import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Detail } from "../../src/webview/components/Detail";
import type { TokenNode, TokenType } from "../../src/core/types";
import { token } from "./fixtures";

/**
 * The detail panel is where every value, rename, description, type and
 * deprecation edit is made, and each one is a callback it must fire once with
 * the right argument.
 */

afterEach(cleanup);

const handlers = () => ({
  onChangeValue: vi.fn(),
  onChangeDescription: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onClose: vi.fn(),
  onChangeDeprecated: vi.fn(),
  onChangeType: vi.fn(),
});

function renderDetail(
  node: TokenNode,
  extra: Partial<ReturnType<typeof handlers>> = {},
  others: TokenNode[] = [],
) {
  const props = { ...handlers(), ...extra };
  render(<Detail token={node} allTokens={[node, ...others]} externalTokens={[]} {...props} />);
  return props;
}

const picker = () => screen.queryByPlaceholderText("Search tokens to reference…");
const linkButton = () => screen.getByRole("button", { name: "Link to token" });
const unlinkButton = () => screen.getByRole("button", { name: "Unlink from token" });

const plain = () =>
  token(
    ["color", "brand", "primary"],
    { colorSpace: "srgb", components: [0, 0, 0] },
    {
      type: "color" as TokenType,
    },
  );

const alias = () =>
  token(["color", "brand", "accent"], "{color.brand.primary}", {
    type: "color" as TokenType,
    resolvedValue: { colorSpace: "srgb", components: [0, 0, 0] },
    resolvedType: "color" as TokenType,
  });

describe("Detail", () => {
  it("shows a plain token's own editor, with no alias UI in the way", () => {
    renderDetail(plain());
    // One Value section: the colour editor, and a button to reference a token.
    expect(screen.getByLabelText("Pick color")).toBeTruthy();
    expect(linkButton()).toBeTruthy();
    expect(picker()).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("shows an alias as its reference, resolved, in the same place", () => {
    renderDetail(alias());
    expect(screen.getByText("color.brand.primary")).toBeTruthy();
    expect(unlinkButton()).toBeTruthy();
    // The value editor belongs to the token it points at, not to this one.
    expect(screen.queryByLabelText("Pick color")).toBeNull();
    expect(picker()).toBeNull();
  });

  it("opens the token list from the link button, for a plain token", () => {
    const props = renderDetail(plain());
    fireEvent.click(linkButton());
    expect(picker()).toBeTruthy();
    expect(props.onChangeValue).not.toHaveBeenCalled();
  });

  it("opens the token list by clicking the reference itself", () => {
    renderDetail(alias());
    fireEvent.click(screen.getByRole("button", { name: /color\.brand\.primary/ }));
    expect(picker()).toBeTruthy();
  });

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
    ]);
    fireEvent.click(linkButton());
    fireEvent.click(screen.getByText("color.base.white"));
    expect(props.onChangeValue).toHaveBeenCalledWith("{color.base.white}");
    expect(picker()).toBeNull();
  });

  it("unlinking keeps the value the alias resolved to", () => {
    const props = renderDetail(alias());
    fireEvent.click(unlinkButton());
    expect(props.onChangeValue).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [0, 0, 0],
    });
  });

  it("renames on blur, once, with the name trimmed", () => {
    const props = renderDetail(plain());
    fireEvent.click(screen.getByRole("heading", { level: 2 }));
    const input = screen.getByDisplayValue("primary");
    fireEvent.change(input, { target: { value: "  secondary  " } });
    fireEvent.blur(input);
    expect(props.onRename.mock.calls).toEqual([["secondary"]]);
  });

  it("does not rename when the name is unchanged", () => {
    const props = renderDetail(plain());
    fireEvent.click(screen.getByRole("heading", { level: 2 }));
    fireEvent.blur(screen.getByDisplayValue("primary"));
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("does not rename when the name is emptied", () => {
    const props = renderDetail(plain());
    fireEvent.click(screen.getByRole("heading", { level: 2 }));
    const input = screen.getByDisplayValue("primary");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("marks a token deprecated", () => {
    const props = renderDetail(plain());
    fireEvent.click(screen.getByLabelText("Mark as deprecated"));
    expect(props.onChangeDeprecated).toHaveBeenCalledWith(true);
  });
});
