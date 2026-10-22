import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COMMIT_DELAY_MS, NumberInput, TextInput } from "../../src/webview/editors/fields";

/**
 * Text and number inputs commit while typing, once typing pauses, instead of
 * only on blur — so the table and the JSON follow the detail panel live.
 */

afterEach(cleanup);
beforeEach(() => {
  vi.useFakeTimers();
  return () => vi.useRealTimers();
});

const pause = () => act(() => vi.advanceTimersByTime(COMMIT_DELAY_MS));

describe("TextInput", () => {
  it("commits once typing pauses, not on every keystroke", () => {
    const onCommit = vi.fn();
    render(<TextInput value="" onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    for (const v of ["P", "Pr", "Pri", "Primary"])
      fireEvent.change(input, { target: { value: v } });
    expect(onCommit).not.toHaveBeenCalled();
    pause();
    expect(onCommit.mock.calls).toEqual([["Primary"]]);
  });

  it("commits at once on blur, without waiting for the pause", () => {
    const onCommit = vi.fn();
    render(<TextInput value="" onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Primary" } });
    fireEvent.blur(input);
    expect(onCommit.mock.calls).toEqual([["Primary"]]);
    pause();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft while focused when the value changes underneath it", () => {
    const { rerender } = render(<TextInput value="a" onCommit={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    rerender(<TextInput value="ab" onCommit={() => {}} />);
    expect(input.value).toBe("abc");
  });

  it("follows the value when not focused", () => {
    const { rerender } = render(<TextInput value="a" onCommit={() => {}} />);
    rerender(<TextInput value="from JSON" onCommit={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("from JSON");
  });

  it("flushes a pending commit when it unmounts, so switching tokens mid-word keeps the word", () => {
    const onCommit = vi.fn();
    const { unmount } = render(<TextInput value="" onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "half" } });
    unmount();
    expect(onCommit.mock.calls).toEqual([["half"]]);
  });

  it("does not commit an unchanged value", () => {
    const onCommit = vi.fn();
    render(<TextInput value="same" onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "same" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("NumberInput", () => {
  it("commits the number once typing pauses", () => {
    const onCommit = vi.fn();
    render(<NumberInput value={0} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "16" } });
    pause();
    expect(onCommit.mock.calls).toEqual([[16]]);
  });

  it("skips a half-typed number and restores the value if left that way", () => {
    const onCommit = vi.fn();
    render(<NumberInput value={8} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    pause();
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("8");
  });
});
