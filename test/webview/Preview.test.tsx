import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Preview } from "../../src/webview/components/Preview";
import type { TokenType } from "../../src/core/types";
import { token } from "./fixtures";

/**
 * The preview picks a renderer per resolved type, and remembers the backdrop
 * someone picked across remounts. Both fail silently: a wrong branch renders
 * nothing, a lost backdrop just resets.
 */

afterEach(cleanup);

const typed = (type: string, value: unknown) => token(["t"], value, { type: type as TokenType });

const backdrop = () => screen.getByRole("radiogroup", { name: "Preview backdrop" });

describe("Preview color", () => {
  it("shows the swatch, hex and oklch, and both contrast ratios", () => {
    const { container } = render(<Preview token={typed("color", "#3b82f6")} />);
    const fill = container.querySelector<HTMLElement>(".swatch > span")!;
    expect(fill.style.background).toBe("rgb(59, 130, 246)");
    const codes = [...container.querySelectorAll("code")].map((c) => c.textContent);
    expect(codes[0]).toBe("#3b82f6");
    expect(codes[1]).toMatch(/^oklch\(/);
    const contrast = container.querySelector(".contrast")!.textContent;
    expect(contrast).toContain("3.67 on white ✗ AA");
    expect(contrast).toContain("5.7 on black ✓ AA");
  });

  it("adds the contrast against the editor background, with its verdict", () => {
    document.documentElement.style.setProperty("--vscode-editor-background", "#1e1e1e");
    try {
      const { container } = render(<Preview token={typed("color", "#3b82f6")} />);
      const entries = [...container.querySelectorAll(".contrast > span")].map((e) => e.textContent);
      expect(entries).toHaveLength(3);
      expect(entries[2]).toMatch(/^\d+(\.\d+)? on editor [✓✗] AA$/);
    } finally {
      document.documentElement.style.removeProperty("--vscode-editor-background");
    }
  });

  it("shows no editor background entry when the theme sets none", () => {
    const { container } = render(<Preview token={typed("color", "#3b82f6")} />);
    expect(container.querySelector(".contrast")!.textContent).not.toContain("on editor");
  });

  it("previews the resolved value of an alias, not the reference", () => {
    const alias = token(["t"], "{color.brand}", {
      type: "color" as TokenType,
      resolvedValue: "#000000",
    });
    const { container } = render(<Preview token={alias} />);
    expect(container.querySelector("code")!.textContent).toBe("#000000");
  });
});

describe("Preview staged types", () => {
  const cases: Array<[string, unknown, string]> = [
    [
      "typography",
      { fontFamily: "Inter", fontSize: { value: 16, unit: "px" }, fontWeight: 600 },
      "p",
    ],
    ["fontFamily", ["Inter", "sans-serif"], "p"],
    ["fontWeight", 700, "p"],
    [
      "shadow",
      {
        color: "#000000",
        offsetX: { value: 0, unit: "px" },
        offsetY: { value: 2, unit: "px" },
        blur: { value: 4, unit: "px" },
        spread: { value: 0, unit: "px" },
      },
      "div",
    ],
  ];

  it.each(cases)(
    "renders a %s sample on a stage beside the backdrop switch",
    (type, value, tag) => {
      const { container } = render(<Preview token={typed(type, value)} />);
      expect(within(backdrop()).getAllByRole("radio")).toHaveLength(3);
      const sample = container.querySelector(".preview.staged .stage > *")!;
      expect(sample.tagName.toLowerCase()).toBe(tag);
      if (tag === "p") expect(sample.textContent).toContain("quick brown fox");
      else expect((sample as HTMLElement).style.boxShadow).not.toBe("");
    },
  );
});

describe("Preview backdrop", () => {
  const checked = () =>
    within(backdrop())
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true")
      .map((r) => r.textContent);

  it("checks the clicked backdrop and keeps it across a remount", () => {
    const t = typed("fontWeight", 700);
    const first = render(<Preview token={t} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(checked()).toEqual(["Dark"]);

    // The panel remounts per selected token; the choice lives at module level.
    first.unmount();
    render(<Preview token={typed("fontFamily", "Inter")} />);
    expect(checked()).toEqual(["Dark"]);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(checked()).toEqual(["Light"]);

    // Back to the default, so the module-level choice does not leak into later tests.
    fireEvent.click(screen.getByRole("radio", { name: "Theme" }));
    expect(checked()).toEqual(["Theme"]);
  });
});

describe("Preview with no value", () => {
  it("renders nothing when the token has neither value nor resolvedValue", () => {
    const { container } = render(<Preview token={typed("color", undefined)} />);
    expect(container.innerHTML).toBe("");
  });
});
