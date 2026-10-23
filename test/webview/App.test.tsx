import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}));

import { parseTokens } from "../../src/core/parse";
import { resolveAliases, validate } from "../../src/core";
import { post } from "../../src/webview/vscodeApi";
import {
  App,
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

describe("App", () => {
  beforeAll(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const settings = {
    rootFontSize: 16,
    defaultColorSpace: "srgb",
    defaultDimensionUnit: "px" as const,
    contrastTarget: "AA" as const,
    modeView: "single" as const,
  };
  const black = { colorSpace: "srgb", components: [0, 0, 0] };
  const doc = (a = "a") => ({
    color: { $type: "color", [a]: { $value: black }, b: { $value: black } },
  });

  /** The host's message for a document, as `init` or `update`. */
  function send(type: "init" | "update", d: unknown, extra: Record<string, unknown> = {}) {
    const model = parseTokens(JSON.stringify(d));
    resolveAliases(model);
    const data = {
      type,
      model,
      validation: validate(model),
      externalTokens: [],
      settings,
      scope: [],
      columnWidths: {},
      ...extra,
    };
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data }));
    });
  }
  const posts = (type: string) =>
    vi
      .mocked(post)
      .mock.calls.map((c) => c[0] as { type: string } & Record<string, unknown>)
      .filter((m) => m.type === type);
  const panelName = () => document.querySelector("aside.panel .node-header-name h2")?.textContent;
  const renamePanel = (to: string) => {
    fireEvent.click(document.querySelector("aside.panel .node-header-name h2")!);
    const input = document.querySelector(".node-header-name input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: to } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  it("keeps the panel open on a token renamed from its header (#8)", () => {
    render(<App />);
    send("init", doc(), { selected: ["color", "a"] });
    renamePanel("renamed");
    expect(posts("renameNode")).toEqual([
      { type: "renameNode", path: ["color", "a"], newName: "renamed" },
    ]);
    send("update", doc("renamed"));
    expect(panelName()).toBe("renamed");
  });

  it("keeps the panel open on a group renamed from its header (#8)", () => {
    render(<App />);
    send("init", doc(), { selected: ["color"] });
    renamePanel("colour");
    send("update", { colour: doc().color });
    expect(panelName()).toBe("colour");
  });

  it("refuses a name a sibling already has, in the panel and the table (#8)", () => {
    render(<App />);
    send("init", doc(), { selected: ["color", "a"] });
    renamePanel("b");
    const cell = [...document.querySelectorAll<HTMLElement>("tr.token .name-cell .cell")].find(
      (c) => c.textContent === "a",
    )!;
    act(() => cell.focus());
    const input = document.activeElement as HTMLInputElement;
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(posts("renameNode")).toEqual([]);
    expect(input.className).toContain("bad");
    expect(panelName()).toBe("a");
  });

  it("opens the new group's panel on + Group (#8)", () => {
    render(<App />);
    send("init", doc());
    fireEvent.click(screen.getByText("+ Group"));
    expect(posts("addGroup")).toEqual([{ type: "addGroup", parentPath: [], name: "group" }]);
    send("update", { ...doc(), group: {} });
    expect(panelName()).toBe("group");
    expect(document.querySelector("tr.section")?.textContent).toBeTruthy();
  });

  it("adds a token inside the scoped group when nothing is selected (#8)", () => {
    render(<App />);
    send("init", doc(), { scope: ["color"] });
    fireEvent.click(screen.getByText("+ Token"));
    expect(posts("addToken")[0]).toMatchObject({ parentPath: ["color"] });
  });

  it("posts two different names for a quick double click on + Token (#8)", () => {
    render(<App />);
    send("init", doc());
    fireEvent.click(screen.getByText("+ Token"));
    fireEvent.click(screen.getByText("+ Token"));
    expect(posts("addToken").map((m) => m.name)).toEqual(["token", "token1"]);
  });
});
