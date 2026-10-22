import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}));

import { post } from "../../src/webview/vscodeApi";
import { App } from "../../src/webview/App";
import { Table, type TableModes } from "../../src/webview/components/Table";
import { parseTokens } from "../../src/core/parse";
import { DEFAULT_SETTINGS } from "../../src/webview/lib/settings";
import type { Modes } from "../../src/shared/protocol";
import { group, token } from "./fixtures";
import type { TokenType } from "../../src/core/types";
import "../../src/webview/styles";

/** Spec 063: a mode file's value columns, one per shown mode, and the
 *  toolbar's mode dropdown and view toggle. */

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

const color = "color" as TokenType;
const root = () =>
  group([], [group(["theme"], [token(["theme", "accent"], "#2563eb", { type: color })])]);
const values: Modes["values"] = {
  light: { "theme.accent": { value: "#2563eb", file: "light.tokens.json" } },
  dark: { "theme.accent": { value: "#60a5fa", file: "dark.tokens.json" } },
  remote: { "theme.accent": { value: "#000000" } },
};
const edits = { rename: vi.fn(), setValue: vi.fn(), setDescription: vi.fn(), reorder: vi.fn() };

function renderTable(shown: string[]) {
  const modes: TableModes = { own: "light", values, shown, setValue: vi.fn() };
  render(
    <Table
      root={root()}
      aliasCandidates={[]}
      query=""
      scopePath={[]}
      selectedKey={null}
      issues={new Map()}
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      edits={edits}
      modes={modes}
    />,
  );
  return modes;
}

const headers = () => [...document.querySelectorAll("thead th")].map((th) => th.textContent);
const cells = () => [...document.querySelectorAll<HTMLElement>("tr.token .value-cell")];

describe("mode columns", () => {
  it("side by side, gives every mode a column and drops Description", () => {
    renderTable(["light", "dark", "remote"]);
    expect(headers()).toEqual(["Name", "light", "dark", "remote", "Type", ""]);
    expect(cells().map((c) => c.textContent)).toEqual(["#2563eb", "#60a5fa", "#000000"]);
  });

  it("writes this file's own mode through setValue, another mode through its own file", () => {
    const modes = renderTable(["light", "dark"]);
    const [light, dark] = cells();
    fireEvent.focus(light.querySelector(".cell")!);
    fireEvent.change(screen.getByDisplayValue("#2563eb"), { target: { value: "#ff0000" } });
    fireEvent.keyDown(screen.getByDisplayValue("#ff0000"), { key: "Enter" });
    expect(edits.setValue).toHaveBeenCalledWith(["theme", "accent"], expect.anything());
    fireEvent.focus(dark.querySelector(".cell")!);
    fireEvent.change(screen.getByDisplayValue("#60a5fa"), { target: { value: "#00ff00" } });
    fireEvent.keyDown(screen.getByDisplayValue("#00ff00"), { key: "Enter" });
    expect(modes.setValue).toHaveBeenCalledWith("dark", ["theme", "accent"], expect.anything());
  });

  it("makes a mode with no file of its own read-only", () => {
    renderTable(["light", "remote"]);
    const remote = cells()[1];
    expect(remote.querySelector(".cell.readonly")).not.toBeNull();
    expect(remote.querySelector(".alias-trigger")).toBeNull();
  });

  it("in single view, shows the chosen mode under its own name", () => {
    renderTable(["dark"]);
    expect(headers()).toContain("dark");
    expect(cells().map((c) => c.textContent)).toEqual(["#60a5fa"]);
  });
});

/** #461: in a narrow mode column the alias chip shrinks and ellipsizes
 *  inside its own pill. As an inline-block in a block cell it was atomic to
 *  the cell's ellipsis, so the whole chip turned into "…". jsdom has no
 *  layout, so this pins the computed styles that give the chip its room. */
describe("mode column alias chip", () => {
  it("lays the swatch and chip out as a row the chip can shrink in", () => {
    const aliased = () =>
      group(
        [],
        [
          group(
            ["theme"],
            [
              token(["theme", "accent"], "{color.blue-600}", {
                type: color,
                resolvedValue: {
                  colorSpace: "srgb",
                  components: [0.15, 0.39, 0.92],
                  hex: "#2563eb",
                },
              }),
            ],
          ),
        ],
      );
    const aliasValues: Modes["values"] = {
      light: {
        "theme.accent": {
          value: "{color.blue-600}",
          resolved: { colorSpace: "srgb", components: [0.15, 0.39, 0.92], hex: "#2563eb" },
          file: "light.tokens.json",
        },
      },
      dark: {
        "theme.accent": {
          value: "{color.blue-400}",
          resolved: { colorSpace: "srgb", components: [0.38, 0.65, 0.98], hex: "#60a5fa" },
          file: "dark.tokens.json",
        },
      },
    };
    const modes: TableModes = {
      own: "light",
      values: aliasValues,
      shown: ["light", "dark"],
      setValue: vi.fn(),
    };
    render(
      <Table
        root={aliased()}
        aliasCandidates={[]}
        query=""
        scopePath={[]}
        selectedKey={null}
        issues={new Map()}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        edits={edits}
        modes={modes}
      />,
    );
    for (const cell of cells().map((c) => c.querySelector<HTMLElement>(".cell")!)) {
      const [glyph, chip] = [...cell.children] as HTMLElement[];
      expect(glyph.classList).toContain("glyph");
      expect(chip.classList).toContain("chip");
      expect(getComputedStyle(cell).display).toBe("flex");
      expect(getComputedStyle(glyph).flexShrink).toBe("0");
      expect(parseFloat(getComputedStyle(chip).minWidth)).toBe(0);
    }
  });
});

describe("mode toolbar", () => {
  const init = (modes?: Modes) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "init",
            model: parseTokens('{"theme":{"$type":"color","accent":{"$value":"#2563eb"}}}'),
            validation: { issues: [] },
            externalTokens: [],
            settings: DEFAULT_SETTINGS,
            scope: [],
            columnWidths: {},
            modes,
          },
        }),
      );
    });
  const modes: Modes = {
    modifier: "theme",
    contexts: ["light", "dark", "remote"],
    own: "light",
    active: "light",
    values,
  };

  it("offers every mode in a dropdown that makes the pick the active one", () => {
    render(<App />);
    init(modes);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["light", "dark", "remote"]);
    fireEvent.change(select, { target: { value: "dark" } });
    expect(post).toHaveBeenCalledWith({ type: "setMode", context: "dark" });
    expect(headers()).toContain("dark");
  });

  it("saves the view toggle as the setting, and hides the dropdown side by side", () => {
    render(<App />);
    init(modes);
    fireEvent.click(screen.getByRole("radio", { name: "Every mode side by side" }));
    expect(post).toHaveBeenCalledWith({ type: "setModeView", view: "sideBySide" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(headers()).toEqual(["Name", "light", "dark", "remote", "Type", ""]);
  });

  it("shows none of it on a file that is not a mode file", () => {
    render(<App />);
    init(undefined);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
