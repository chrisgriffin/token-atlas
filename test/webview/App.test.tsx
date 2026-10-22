import { describe, it, expect, vi } from "vitest";

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}));

import { parseTokens } from "../../src/core/parse";
import {
  PANEL_MAX_SHARE,
  PANEL_MIN,
  clampPanelWidth,
  findNode,
  flattenTokens,
  siblingNames,
  uniqueName,
} from "../../src/webview/App";

const { root } = parseTokens(
  JSON.stringify({
    color: {
      $type: "color",
      base: { blue: { $value: "#00f" }, red: { $value: "#f00" } },
      brand: { primary: { $value: "{color.base.blue}" } },
    },
    space: { $type: "dimension", md: { $value: { value: 16, unit: "px" } } },
  }),
);

describe("siblingNames", () => {
  it("names the children at the root and inside a nested group", () => {
    expect(siblingNames(root, [])).toEqual(new Set(["color", "space"]));
    expect(siblingNames(root, ["color", "base"])).toEqual(new Set(["blue", "red"]));
  });

  it("is empty for a path that does not resolve to a group", () => {
    expect(siblingNames(root, ["nope"]).size).toBe(0);
    expect(siblingNames(root, ["color", "base", "blue"]).size).toBe(0);
  });
});

describe("uniqueName", () => {
  it("returns the base name when it is free", () => {
    expect(uniqueName("token", new Set(["group"]))).toBe("token");
  });

  it("suffixes a taken name", () => {
    expect(uniqueName("token", new Set(["token"]))).toBe("token1");
  });

  it("skips suffixes that are also taken", () => {
    expect(uniqueName("token", new Set(["token", "token1", "token2"]))).toBe("token3");
  });
});

describe("flattenTokens", () => {
  it("returns every token under nested groups in document order, and no groups", () => {
    const tokens = flattenTokens(root);
    expect(tokens.map((t) => t.path.join("."))).toEqual([
      "color.base.blue",
      "color.base.red",
      "color.brand.primary",
      "space.md",
    ]);
    expect(tokens.every((t) => t.kind === "token")).toBe(true);
  });
});

describe("findNode", () => {
  it("returns the token or group at a path", () => {
    expect(findNode(root, ["color", "brand", "primary"])).toMatchObject({
      kind: "token",
      path: ["color", "brand", "primary"],
    });
    expect(findNode(root, ["color", "base"])).toMatchObject({ kind: "group", name: "base" });
  });

  it("returns null for a path that does not resolve", () => {
    expect(findNode(root, ["color", "missing"])).toBeNull();
    expect(findNode(root, ["space", "md", "deeper"])).toBeNull();
    expect(findNode(root, [])).toBeNull();
  });
});

describe("clampPanelWidth", () => {
  it("clamps to PANEL_MIN at the low end", () => {
    expect(clampPanelWidth(10, 2000)).toBe(PANEL_MIN);
  });

  it("clamps to PANEL_MAX_SHARE of the window at the high end", () => {
    expect(clampPanelWidth(5000, 2000)).toBe(2000 * PANEL_MAX_SHARE);
    expect(clampPanelWidth(Infinity, 1001)).toBe(Math.round(1001 * PANEL_MAX_SHARE));
  });

  it("passes a width inside the range through, rounded", () => {
    expect(clampPanelWidth(500.4, 2000)).toBe(500);
  });
});
