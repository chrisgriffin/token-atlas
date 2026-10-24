import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  DeleteButton,
  DeprecatedField,
  DeprecatedPill,
  NodeHeader,
  Problems,
  Section,
  TypeSelect,
} from "../../src/webview/components/shared";
import { COMPOSITE_TYPES, PRIMITIVE_TYPES, type ValidationIssue } from "../../src/core/types";

/**
 * The primitives every detail panel composes. Each takes its data as props and
 * reports back through a handler, so each renders on its own — the assertions
 * below are on the argument that reaches the handler, not on the control.
 */

// Vitest runs without `globals`, so testing-library's auto-cleanup never
// registers; unmount between tests explicitly or the renders accumulate.
afterEach(cleanup);

const headerHandlers = () => ({
  onRename: vi.fn(),
  onMove: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
});

function renderHeader(
  extra: {
    badge?: ReactNode;
    below?: ReactNode;
    summary?: ReactNode;
    onOpenPath?: (path: string[]) => void;
  } = {},
) {
  const handlers = headerHandlers();
  render(
    <NodeHeader name="primary" path={["color", "brand", "primary"]} {...extra} {...handlers} />,
  );
  return handlers;
}

/** Open the click-to-rename field and hand back the input. */
function startRename() {
  fireEvent.click(screen.getByRole("heading", { level: 2 }));
  return screen.getByDisplayValue("primary");
}

describe("NodeHeader", () => {
  it("renders the name, the path and both slots", () => {
    renderHeader({ badge: <span>badge</span>, below: <span>below</span>, summary: "#3b82f6" });

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("primary");
    expect(screen.getByRole("navigation", { name: "Path" }).textContent).toBe("color/brand");
    expect(screen.getByText("badge")).toBeTruthy();
    // The type and the summary share the line under the name.
    const meta = screen.getByText("below").parentElement!;
    expect(meta.className).toBe("node-header-meta");
    expect(meta.textContent).toBe("below·#3b82f6");
  });

  it("opens each breadcrumb segment's group", () => {
    const onOpenPath = vi.fn();
    renderHeader({ onOpenPath });

    fireEvent.click(screen.getByRole("button", { name: "color" }));
    fireEvent.click(screen.getByRole("button", { name: "brand" }));

    expect(onOpenPath.mock.calls).toEqual([[["color"]], [["color", "brand"]]]);
  });

  it("leaves out the meta line when there is nothing to show", () => {
    renderHeader();
    expect(document.querySelector(".node-header-meta")).toBeNull();
  });

  it("renames on blur with the name trimmed", () => {
    const handlers = renderHeader();

    const input = startRename();
    fireEvent.change(input, { target: { value: "  brand-primary  " } });
    fireEvent.blur(input);

    expect(handlers.onRename.mock.calls).toEqual([["brand-primary"]]);
  });

  it("commits on Enter", () => {
    const handlers = renderHeader();

    const input = startRename();
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handlers.onRename.mock.calls).toEqual([["renamed"]]);
  });

  it("reports nothing for an unchanged or blank name", () => {
    const handlers = renderHeader();

    fireEvent.blur(startRename());
    const blank = startRename();
    fireEvent.change(blank, { target: { value: "   " } });
    fireEvent.blur(blank);

    expect(handlers.onRename.mock.calls).toEqual([]);
  });

  it("abandons the rename on Escape", () => {
    const handlers = renderHeader();

    const input = startRename();
    fireEvent.change(input, { target: { value: "discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(handlers.onRename.mock.calls).toEqual([]);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("primary");
  });

  it("reports the move direction, and closes", () => {
    const handlers = renderHeader();

    fireEvent.click(screen.getByLabelText("Move up"));
    fireEvent.click(screen.getByLabelText("Move down"));
    fireEvent.click(screen.getByLabelText("Close"));

    expect(handlers.onMove.mock.calls).toEqual([["up"], ["down"]]);
    // `onClose` is the click handler itself, so it is handed the event.
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("groups move and delete, keeps close apart, and has no pencil", () => {
    renderHeader();

    const group = screen.getByRole("group", { name: "Actions" });
    expect([...group.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Move up",
      "Move down",
      "Delete",
    ]);
    // Close acts on the panel, so it sits in the header's corner, not the row.
    const close = screen.getByLabelText("Close");
    expect(group.contains(close)).toBe(false);
    expect(close.parentElement!.tagName).toBe("HEADER");
    expect(screen.queryByLabelText("Rename")).toBeNull();
  });
});

describe("DeleteButton", () => {
  it("arms on the first click and deletes on the second", () => {
    const onDelete = vi.fn();
    render(<DeleteButton onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("Delete"));
    expect(onDelete.mock.calls).toEqual([]);
    expect(screen.getByLabelText("Delete").title).toBe("Click again to delete");

    fireEvent.click(screen.getByLabelText("Delete"));
    expect(onDelete.mock.calls).toEqual([[]]);
  });

  it("disarms after three seconds", () => {
    vi.useFakeTimers();
    try {
      const onDelete = vi.fn();
      render(<DeleteButton onDelete={onDelete} />);

      fireEvent.click(screen.getByLabelText("Delete"));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByLabelText("Delete").title).toBe("Delete");

      // The next click re-arms rather than deleting.
      fireEvent.click(screen.getByLabelText("Delete"));
      expect(onDelete.mock.calls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Section", () => {
  it("renders its label, children and aside", () => {
    const { container } = render(
      <Section label="Value" aside={<button>Alias</button>}>
        <input placeholder="token value" />
      </Section>,
    );

    expect(container.querySelector(".eyebrow")?.textContent).toBe("Value");
    expect(screen.getByRole("button", { name: "Alias" })).toBeTruthy();
    expect(screen.getByPlaceholderText("token value")).toBeTruthy();
  });

  it("leaves the label alone in the head when there is no aside", () => {
    const { container } = render(
      <Section label="Value">
        <input placeholder="token value" />
      </Section>,
    );

    expect(container.querySelector(".section-head")?.childElementCount).toBe(1);
  });
});

describe("DeprecatedField", () => {
  it("reports true when ticked and undefined when unticked", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DeprecatedField value={undefined} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onChange.mock.calls).toEqual([[true]]);

    rerender(<DeprecatedField value={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange.mock.calls).toEqual([[true], [undefined]]);
  });

  it("shows a string value as the reason, and reports it trimmed", () => {
    const onChange = vi.fn();
    render(<DeprecatedField value="use {color.brand.primary}" onChange={onChange} />);

    const reason = screen.getByDisplayValue("use {color.brand.primary}");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);

    fireEvent.change(reason, { target: { value: "  use {color.brand.accent}  " } });
    fireEvent.blur(reason);

    expect(onChange.mock.calls).toEqual([["use {color.brand.accent}"]]);
  });

  it("falls back to true when the reason is emptied", () => {
    const onChange = vi.fn();
    render(<DeprecatedField value="use something else" onChange={onChange} />);

    const reason = screen.getByDisplayValue("use something else");
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.blur(reason);

    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it("names a replacement as the reason's first reference, and reports the pick", () => {
    const onChange = vi.fn();
    render(
      <DeprecatedField
        value="too faint; use {color.border.strong} instead"
        onChange={onChange}
        replacements={["color.border.default", "color.border.strong"]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Replacement" }) as HTMLSelectElement;
    expect(select.value).toBe("color.border.strong");
    fireEvent.change(select, { target: { value: "color.border.default" } });
    fireEvent.change(select, { target: { value: "" } });

    expect(onChange.mock.calls).toEqual([
      ["too faint; use {color.border.strong} instead", "color.border.default"],
      ["too faint; use {color.border.strong} instead", ""],
    ]);
  });

  it("keeps a replacement that is not among the choices visible", () => {
    render(<DeprecatedField value="use {gone}" onChange={vi.fn()} replacements={["color.a"]} />);
    expect((screen.getByRole("combobox", { name: "Replacement" }) as HTMLSelectElement).value).toBe(
      "gone",
    );
  });

  it("offers no replacement picker without choices, or until it is deprecated", () => {
    const { rerender } = render(<DeprecatedField value={true} onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Replacement" })).toBeNull();
    rerender(<DeprecatedField value={undefined} onChange={vi.fn()} replacements={["color.a"]} />);
    expect(screen.queryByRole("combobox", { name: "Replacement" })).toBeNull();
  });

  it("offers no reason field until it is deprecated", () => {
    render(<DeprecatedField value={undefined} onChange={vi.fn()} />);

    expect(screen.queryByPlaceholderText(/Reason or replacement/)).toBeNull();
  });
});

describe("Problems", () => {
  const issues: ValidationIssue[] = [
    { severity: "error", path: ["color", "brand"], message: "unresolved reference" },
    { severity: "warning", path: ["space", "md"], message: "duplicate path" },
  ];

  it("renders nothing without issues", () => {
    expect(render(<Problems />).container.innerHTML).toBe("");
  });

  it("renders nothing for an empty list", () => {
    expect(render(<Problems issues={[]} />).container.innerHTML).toBe("");
  });

  it("renders one entry per issue, carrying its severity", () => {
    const { container } = render(<Problems issues={issues} />);

    const entries = [...container.querySelectorAll("li")];
    expect(entries.map((li) => li.className)).toEqual(["sev-error", "sev-warning"]);
    expect(screen.getByText("unresolved reference")).toBeTruthy();
    expect(screen.getByText("duplicate path")).toBeTruthy();
  });
});

describe("DeprecatedPill", () => {
  it("titles a bare true as Deprecated", () => {
    render(<DeprecatedPill value={true} />);

    expect(screen.getByText("deprecated").title).toBe("Deprecated");
  });

  it("titles a replacement string with the replacement", () => {
    render(<DeprecatedPill value="use {color.brand.primary}" />);

    expect(screen.getByText("deprecated").title).toBe("use {color.brand.primary}");
  });

  it("renders nothing when undefined", () => {
    expect(render(<DeprecatedPill value={undefined} />).container.innerHTML).toBe("");
  });
});

describe("TypeSelect", () => {
  it("reports the type that was picked", () => {
    const onChange = vi.fn();
    render(<TypeSelect value={undefined} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Token type"), { target: { value: "dimension" } });

    expect(onChange.mock.calls).toEqual([["dimension"]]);
  });

  it("reports undefined when the type is cleared", () => {
    const onChange = vi.fn();
    render(<TypeSelect value="color" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Token type"), { target: { value: "" } });

    expect(onChange.mock.calls).toEqual([[undefined]]);
  });

  it("offers every primitive and composite type", () => {
    const { container } = render(<TypeSelect value={undefined} onChange={vi.fn()} />);

    const values = [...container.querySelectorAll("option")].map((o) => o.value);
    expect(values).toEqual(["", ...PRIMITIVE_TYPES, ...COMPOSITE_TYPES]);
  });

  it("names where an inherited type came from", () => {
    const { rerender } = render(
      <TypeSelect value={undefined} inherited="color" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("option", { name: "color (inherited)" })).toBeTruthy();
    expect(screen.getByLabelText("Token type").title).toContain("inherited from a group");

    rerender(
      <TypeSelect value={undefined} inherited="color" from="reference" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("option", { name: "color (via alias)" })).toBeTruthy();
    expect(screen.getByLabelText("Token type").title).toContain("from the referenced token");
  });

  it("shows the icon of the declared or inherited type, and none when untyped", () => {
    const icon = (c: HTMLElement) => c.querySelector(".type-icon")?.getAttribute("data-type");
    const { container, rerender } = render(<TypeSelect value="shadow" onChange={vi.fn()} />);
    expect(icon(container)).toBe("shadow");

    rerender(<TypeSelect value={undefined} inherited="border" onChange={vi.fn()} />);
    expect(icon(container)).toBe("border");

    rerender(<TypeSelect value={undefined} onChange={vi.fn()} />);
    expect(icon(container)).toBeUndefined();
  });
});
