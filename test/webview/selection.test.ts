import { describe, expect, it } from "vitest";
import "../../src/webview/styles";

/**
 * High Contrast themes leave the list selection colours unset, so a selected
 * row needs an outline to show at all; the table also needs a ring when it is
 * tabbed into, before any row has focus. jsdom has no layout, so these pin
 * the rules.
 */
const rule = (selector: string) =>
  ([...document.styleSheets].flatMap((s) => [...s.cssRules]) as CSSStyleRule[]).find(
    (r) => r.selectorText === selector,
  );

describe("selection and focus in High Contrast and from the keyboard", () => {
  it("outlines the selected table and picker rows with the contrast border (#8)", () => {
    const style = rule(".row.active, table.tokens tr.token.active")?.style;
    expect(style?.getPropertyValue("outline")).toContain("--vscode-contrastActiveBorder");
  });

  it("rings the table when it is tabbed into (#8)", () => {
    const style = rule(".table-wrap:focus-visible")?.style;
    expect(style?.getPropertyValue("outline")).toContain("--vscode-focusBorder");
  });
});
