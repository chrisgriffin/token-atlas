import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InlineCell } from "../../src/webview/components/InlineCell";

/**
 * The table cell that edits in place. Five rules live here and each is a
 * separate path: the display span swaps in an input, Enter and blur commit,
 * Escape cancels, and a `commit` that returns false keeps the cell open on
 * Enter but reverts on blur.
 *
 * `commit` only runs when the draft differs from the text, so every commit
 * test changes the input first; the assertions read the whole call list, so an
 * extra commit fails too.
 */

// Vitest runs without `globals`, so testing-library's auto-cleanup never
// registers; unmount between tests explicitly or the renders accumulate.
afterEach(cleanup);

/** Renders a cell on `text`, with a `commit` that accepts unless told not to. */
function renderCell(text = "primary", accept = true) {
  const commit = vi.fn(() => accept);
  const result = render(<InlineCell text={text} commit={commit} />);
  return { ...result, commit };
}

const display = (container: HTMLElement) => container.querySelector(".cell");
const input = () => screen.getByRole("textbox") as HTMLInputElement;

/** Focuses the display span and types `draft` into the input it swaps in. */
function edit(container: HTMLElement, draft: string) {
  fireEvent.focus(display(container)!);
  fireEvent.change(input(), { target: { value: draft } });
  return input();
}

describe("InlineCell display", () => {
  it("shows a focusable span carrying the text, and no input", () => {
    const { container } = renderCell();
    expect(display(container)).toHaveProperty("tabIndex", 0);
    expect(display(container)!.textContent).toBe("primary");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("swaps in an input seeded with the current text when the span is focused", () => {
    const { container } = renderCell();
    fireEvent.focus(display(container)!);
    expect(input().value).toBe("primary");
    expect(display(container)).toBeNull();
  });
});

describe("InlineCell commit", () => {
  it("commits the draft on Enter and closes the cell", () => {
    const { container, commit } = renderCell();
    fireEvent.keyDown(edit(container, "accent"), { key: "Enter" });
    expect(commit.mock.calls).toEqual([["accent"]]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits the draft on blur and closes the cell", () => {
    const { container, commit } = renderCell();
    fireEvent.blur(edit(container, "accent"));
    expect(commit.mock.calls).toEqual([["accent"]]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels on Escape, leaving the original text and committing nothing", () => {
    const { container, commit } = renderCell();
    fireEvent.keyDown(edit(container, "accent"), { key: "Escape" });
    expect(commit).not.toHaveBeenCalled();
    expect(display(container)!.textContent).toBe("primary");
  });
});

describe("InlineCell rejected commit", () => {
  it("keeps the cell open on Enter, still carrying the draft, and marks it bad", () => {
    const { container } = renderCell("primary", false);
    fireEvent.keyDown(edit(container, "accent"), { key: "Enter" });
    expect(input().value).toBe("accent");
    expect(input().className).toContain("bad");
  });

  it("clears the bad mark once the draft is edited again", () => {
    const { container } = renderCell("primary", false);
    fireEvent.keyDown(edit(container, "accent"), { key: "Enter" });
    fireEvent.change(input(), { target: { value: "accents" } });
    expect(input().className).not.toContain("bad");
  });

  it("reverts to the original text on blur", () => {
    const { container, commit } = renderCell("primary", false);
    fireEvent.blur(edit(container, "accent"));
    expect(commit.mock.calls).toEqual([["accent"]]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(display(container)!.textContent).toBe("primary");
  });
});
