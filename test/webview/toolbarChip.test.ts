import { describe, expect, it } from "vitest"
import "../../src/webview/styles"

/**
 * jsdom has no layout, so the chip's height is not measurable here; this pins
 * the rule that gives it the row's height (the buttons'), measured in a real
 * render for #363: 20px before, 26.19px after, equal to + Token.
 */
describe("toolbar scope chip", () => {
  it("stretches to the toolbar row, so it is as tall as the buttons", () => {
    const rules = [...document.styleSheets].flatMap(s => [
      ...s.cssRules,
    ]) as CSSStyleRule[]
    const chip = rules.find(r => r.selectorText === ".toolbar .scope-chip")
    expect(chip?.style.getPropertyValue("align-self")).toBe("stretch")
  })
})
