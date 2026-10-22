import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, settings, setSettings } from "../../src/webview/lib/settings";
import type { EditorSettings } from "../../src/shared/protocol";

const CUSTOM: EditorSettings = {
  rootFontSize: 10,
  defaultColorSpace: "display-p3",
  defaultDimensionUnit: "rem",
  contrastTarget: "AAA",
  modeView: "single",
};

describe("webview settings", () => {
  // Must stay first: it pins the module state before any write in this file.
  it("reads the defaults before the host has pushed anything", () => {
    expect(settings()).toBe(DEFAULT_SETTINGS);
  });

  // These values mirror `editorSettings()` in `src/host/tokenEditorProvider.ts`
  // and the `contributes.configuration` defaults in `package.json` — a coupling
  // CLAUDE.md names and nothing else checks.
  it("defaults to a 16px root, sRGB, px and WCAG AA", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      rootFontSize: 16,
      defaultColorSpace: "srgb",
      defaultDimensionUnit: "px",
      contrastTarget: "AA",
      modeView: "single",
    });
  });

  it("takes the settings the host pushes", () => {
    setSettings(CUSTOM);
    expect(settings()).toEqual(CUSTOM);
  });

  it("falls back to the defaults when the host pushes nothing", () => {
    setSettings(CUSTOM);
    setSettings(undefined);
    expect(settings()).toBe(DEFAULT_SETTINGS);
  });
});
