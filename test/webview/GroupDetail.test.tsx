import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GroupDetail } from "../../src/webview/components/GroupDetail";
import { COMMIT_DELAY_MS } from "../../src/webview/editors/fields";
import type { GroupNode } from "../../src/core/types";
import { group, token } from "./fixtures";

afterEach(cleanup);

const handlers = () => ({
  onChangeDescription: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onClose: vi.fn(),
  onChangeDeprecated: vi.fn(),
  onChangeType: vi.fn(),
});

function renderGroup(node: GroupNode) {
  const props = handlers();
  render(<GroupDetail group={node} {...props} />);
  return props;
}

/** brand holds one token directly and two more in a nested group. */
const nested = () =>
  group(
    ["color", "brand"],
    [
      token(["color", "brand", "primary"], "#000"),
      group(
        ["color", "brand", "on"],
        [
          token(["color", "brand", "on", "light"], "#fff"),
          token(["color", "brand", "on", "dark"], "#111"),
        ],
      ),
    ],
  );

describe("GroupDetail", () => {
  it("counts every token in the subtree, not just direct children", () => {
    renderGroup(nested());
    expect(screen.getByText("3 tokens")).toBeTruthy();
  });

  it("says token, singular, for one", () => {
    renderGroup(group(["space"], [token(["space", "md"], 16)]));
    expect(screen.getByText("1 token")).toBeTruthy();
  });

  it("counts an empty group as no tokens", () => {
    renderGroup(group(["empty"], []));
    expect(screen.getByText("0 tokens")).toBeTruthy();
  });

  it("saves the description on blur, once", () => {
    const props = renderGroup(nested());
    const input = screen.getByPlaceholderText("Optional $description");
    fireEvent.change(input, { target: { value: "Brand colours" } });
    fireEvent.blur(input);
    expect(props.onChangeDescription.mock.calls).toEqual([["Brand colours"]]);
  });

  it("commits while typing, like a token's description", () => {
    vi.useFakeTimers();
    try {
      const props = renderGroup(nested());
      const input = screen.getByPlaceholderText("Optional $description");
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "Brand colours" } });
      act(() => vi.advanceTimersByTime(COMMIT_DELAY_MS));
      expect(props.onChangeDescription.mock.calls).toEqual([["Brand colours"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renames the group on blur with the name trimmed", () => {
    const props = renderGroup(nested());
    fireEvent.click(screen.getByRole("heading", { level: 2 }));
    const input = screen.getByDisplayValue("brand");
    fireEvent.change(input, { target: { value: " marque " } });
    fireEvent.blur(input);
    expect(props.onRename.mock.calls).toEqual([["marque"]]);
  });
});
