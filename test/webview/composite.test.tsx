import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  BorderEditor,
  GradientEditor,
  ShadowEditor,
  StrokeStyleEditor,
  TransitionEditor,
  TypographyEditor,
} from "../../src/webview/editors/composite";

/**
 * The composite editors each own a small shape decision — what a sub-field
 * writes back, and what the whole value becomes. These pin those; the field
 * controls themselves are covered by `fields.test.tsx`.
 */

afterEach(cleanup);

/** Text inputs commit on blur as well as on a pause; blur keeps tests exact. */
const type = (input: HTMLElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

const labelled = (label: string) => screen.getByLabelText(label);

/** The hex text field, not the native colour swatch beside it. */
const hexField = (value: string) =>
  screen.getAllByDisplayValue(value).find((el) => el.classList.contains("mono"))!;

describe("TypographyEditor", () => {
  const render1 = (value: unknown) => {
    const onChange = vi.fn();
    render(<TypographyEditor value={value} onChange={onChange} />);
    return onChange;
  };

  it("writes one font family as a string", () => {
    const onChange = render1({ fontSize: { value: 16, unit: "px" } });
    type(screen.getByPlaceholderText("Inter, sans-serif"), "Inter");
    expect(onChange).toHaveBeenCalledWith({
      fontSize: { value: 16, unit: "px" },
      fontFamily: "Inter",
    });
  });

  it("writes a comma-separated stack as an array, trimmed", () => {
    const onChange = render1({});
    type(screen.getByPlaceholderText("Inter, sans-serif"), " Inter , system-ui ,, sans-serif ");
    expect(onChange).toHaveBeenCalledWith({ fontFamily: ["Inter", "system-ui", "sans-serif"] });
  });

  it("shows an existing array as a comma-separated list", () => {
    render1({ fontFamily: ["Inter", "sans-serif"] });
    expect((screen.getByPlaceholderText("Inter, sans-serif") as HTMLInputElement).value).toBe(
      "Inter, sans-serif",
    );
  });

  it("keeps the other fields when one changes", () => {
    const onChange = render1({ fontFamily: "Inter", lineHeight: 1.5 });
    type(screen.getByPlaceholderText("Inter, sans-serif"), "Georgia");
    expect(onChange).toHaveBeenCalledWith({ fontFamily: "Georgia", lineHeight: 1.5 });
  });
});

describe("BorderEditor", () => {
  it("merges a style change into the rest of the value", () => {
    const onChange = vi.fn();
    render(
      <BorderEditor
        value={{ color: "#ff0000", width: { value: 1, unit: "px" } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(labelled("Style"), { target: { value: "dashed" } });
    expect(onChange).toHaveBeenCalledWith({
      color: "#ff0000",
      width: { value: 1, unit: "px" },
      style: "dashed",
    });
  });

  it("writes the hex a colour sub-field commits", () => {
    const onChange = vi.fn();
    render(<BorderEditor value={{ style: "solid" }} onChange={onChange} />);
    type(hexField("#000000"), "#3b82f6");
    expect(onChange).toHaveBeenCalledWith({ style: "solid", color: "#3b82f6" });
  });
});

describe("StrokeStyleEditor", () => {
  it("reads a string as keyword mode and an object as custom", () => {
    const { unmount } = render(<StrokeStyleEditor value="dashed" onChange={() => {}} />);
    expect((labelled("Mode") as HTMLSelectElement).value).toBe("keyword");
    expect((labelled("Keyword") as HTMLSelectElement).value).toBe("dashed");
    unmount();

    render(<StrokeStyleEditor value={{ dashArray: [], lineCap: "round" }} onChange={() => {}} />);
    expect((labelled("Mode") as HTMLSelectElement).value).toBe("custom");
  });

  it("switching to custom writes a usable starting object", () => {
    const onChange = vi.fn();
    render(<StrokeStyleEditor value="solid" onChange={onChange} />);
    fireEvent.change(labelled("Mode"), { target: { value: "custom" } });
    expect(onChange).toHaveBeenCalledWith({
      dashArray: [{ value: 4, unit: "px" }],
      lineCap: "butt",
    });
  });

  it("switching back to keyword writes solid", () => {
    const onChange = vi.fn();
    render(<StrokeStyleEditor value={{ dashArray: [], lineCap: "butt" }} onChange={onChange} />);
    fireEvent.change(labelled("Mode"), { target: { value: "keyword" } });
    expect(onChange).toHaveBeenCalledWith("solid");
  });
});

describe("StrokeStyleEditor, custom mode", () => {
  const custom = { dashArray: [{ value: 4, unit: "px" }], lineCap: "butt" };

  it("adds a dash length, keeping the ones already there", () => {
    const onChange = vi.fn();
    render(<StrokeStyleEditor value={custom} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add dash" }));
    expect(onChange).toHaveBeenCalledWith({
      ...custom,
      dashArray: [
        { value: 4, unit: "px" },
        { value: 4, unit: "px" },
      ],
    });
  });

  it("removes the dash length that was clicked", () => {
    const onChange = vi.fn();
    render(
      <StrokeStyleEditor
        value={{
          ...custom,
          dashArray: [
            { value: 4, unit: "px" },
            { value: 2, unit: "px" },
          ],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove dash 1" }));
    expect(onChange).toHaveBeenCalledWith({ ...custom, dashArray: [{ value: 2, unit: "px" }] });
  });

  it("changes the line cap without disturbing the dashes", () => {
    const onChange = vi.fn();
    render(<StrokeStyleEditor value={custom} onChange={onChange} />);
    fireEvent.change(labelled("Line cap"), { target: { value: "round" } });
    expect(onChange).toHaveBeenCalledWith({ ...custom, lineCap: "round" });
  });
});

describe("ShadowEditor", () => {
  it("edits a single shadow object without wrapping it in an array", () => {
    const onChange = vi.fn();
    render(<ShadowEditor value={{ color: "#000000", inset: false }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Inset", { selector: "input" }));
    expect(onChange).toHaveBeenCalledWith({ color: "#000000", inset: true });
  });

  it("adding a layer turns the value into an array", () => {
    const onChange = vi.fn();
    render(<ShadowEditor value={{ color: "#000000" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add shadow layer" }));
    const written = onChange.mock.calls[0][0];
    expect(Array.isArray(written)).toBe(true);
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual({ color: "#000000" });
  });

  it("removing the second layer collapses back to a single object", () => {
    const onChange = vi.fn();
    render(
      <ShadowEditor value={[{ color: "#111111" }, { color: "#222222" }]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove layer 2" }));
    expect(onChange).toHaveBeenCalledWith({ color: "#111111" });
  });

  it("offers no Remove button while there is only one layer", () => {
    render(<ShadowEditor value={{ color: "#000000" }} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });
});

describe("GradientEditor", () => {
  it("starts the first stop at 0 and later ones at 1", () => {
    const onChange = vi.fn();
    const { rerender } = render(<GradientEditor value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add stop" }));
    expect(onChange).toHaveBeenLastCalledWith([{ color: "#000000", position: 0 }]);

    rerender(<GradientEditor value={[{ color: "#000000", position: 0 }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add stop" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { color: "#000000", position: 0 },
      { color: "#000000", position: 1 },
    ]);
  });

  it("removes the stop that was clicked, keeping the rest in order", () => {
    const onChange = vi.fn();
    render(
      <GradientEditor
        value={[
          { color: "#000000", position: 0 },
          { color: "#888888", position: 0.5 },
          { color: "#ffffff", position: 1 },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 2" }));
    expect(onChange).toHaveBeenCalledWith([
      { color: "#000000", position: 0 },
      { color: "#ffffff", position: 1 },
    ]);
  });

  it("writes a stop's colour without disturbing its position", () => {
    const onChange = vi.fn();
    render(<GradientEditor value={[{ color: "#000000", position: 0.25 }]} onChange={onChange} />);
    type(hexField("#000000"), "#3b82f6");
    expect(onChange).toHaveBeenCalledWith([{ color: "#3b82f6", position: 0.25 }]);
  });
});

describe("TransitionEditor", () => {
  it("keeps the other fields when the delay changes", () => {
    const onChange = vi.fn();
    render(
      <TransitionEditor
        value={{ duration: { value: 200, unit: "ms" }, timingFunction: [0, 0, 1, 1] }}
        onChange={onChange}
      />,
    );
    const delay = screen.getAllByRole("spinbutton")[1];
    fireEvent.focus(delay);
    fireEvent.change(delay, { target: { value: "50" } });
    fireEvent.blur(delay);
    expect(onChange).toHaveBeenCalledWith({
      duration: { value: 200, unit: "ms" },
      timingFunction: [0, 0, 1, 1],
      delay: { value: 50, unit: "ms" },
    });
  });
});

describe("Remove buttons", () => {
  it("share one style across the composite editors and name what each removes", () => {
    const dash = { value: 4, unit: "px" };
    render(
      <>
        <StrokeStyleEditor
          value={{ dashArray: [dash, dash], lineCap: "butt" }}
          onChange={vi.fn()}
        />
        <ShadowEditor value={[{ color: "#111111" }, { color: "#222222" }]} onChange={vi.fn()} />
        <GradientEditor
          value={[
            { color: "#000000", position: 0 },
            { color: "#ffffff", position: 1 },
          ]}
          onChange={vi.fn()}
        />
      </>,
    );
    const buttons = screen.getAllByRole("button", { name: /^Remove / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remove dash 1",
      "Remove dash 2",
      "Remove layer 1",
      "Remove layer 2",
      "Remove stop 1",
      "Remove stop 2",
    ]);
    expect(new Set(buttons.map((b) => b.className))).toEqual(new Set(["secondary"]));
    expect(buttons.every((b) => b.textContent === "Remove")).toBe(true);
  });
});
