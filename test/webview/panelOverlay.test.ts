import { describe, it, expect } from "vitest";
import "../../src/webview/styles";

/**
 * The detail panel floats over the table instead of taking width from it
 * (spec 056): a flex-item panel squeezed the table's columns unreadable.
 */
describe("detail panel overlay", () => {
  const styled = (className: string) => {
    const el = document.createElement("div");
    el.className = className;
    document.body.appendChild(el);
    return getComputedStyle(el);
  };

  it("positions the panel over the table's right edge", () => {
    const panel = styled("panel");
    expect(panel.position).toBe("absolute");
    expect(panel.right).toBe("0px");
    expect(panel.top).toBe("0px");
    expect(panel.bottom).toBe("0px");
  });

  it("floats the resize handle with it", () => {
    expect(styled("panel-resizer").position).toBe("absolute");
  });
});
