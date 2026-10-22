import { describe, it, expect } from "vitest";
import "../../src/webview/styles";

/**
 * The column header and group headings stick while the rows scroll. In a
 * collapsed-border table a sticky cell's border stays behind with the rows,
 * leaving a 1px gap the rows show through, so the line is a shadow (#417).
 */
describe("sticky table header line", () => {
  it("draws the column header and group heading lines as inset shadows", () => {
    document.body.innerHTML = `<table class="tokens"><thead><tr><th>Name</th></tr></thead>
      <tbody><tr class="section"><th>color</th></tr></tbody></table>`;
    for (const th of document.querySelectorAll("th")) {
      const style = getComputedStyle(th);
      expect(style.position).toBe("sticky");
      expect(style.borderBottomStyle || "none").toBe("none");
      expect(style.boxShadow).toContain("inset");
    }
  });
});
