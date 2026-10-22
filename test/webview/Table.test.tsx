import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Table, type TableModes } from "../../src/webview/components/Table";
import { group, sampleRoot, token } from "./fixtures";
import type { TokenType } from "../../src/core/types";

/**
 * What the table itself decides: which rows exist, and what the keyboard does.
 * Drag-reorder and inline-edit logic live in `reorder.test.ts` / `inline.test.ts`.
 */

beforeAll(() => {
  // The width-observing effect runs on mount; jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  // The edit callbacks are shared by every render in this file; without this
  // their calls accumulate for whoever asserts on them first.
  vi.clearAllMocks();
});

const edits = {
  rename: vi.fn(),
  setValue: vi.fn(),
  setDescription: vi.fn(),
  reorder: vi.fn(),
};

function renderTable(props: Partial<Parameters<typeof Table>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  const result = render(
    <Table
      root={sampleRoot()}
      aliasCandidates={[]}
      query=""
      scopePath={[]}
      selectedKey={null}
      issues={new Map()}
      onSelect={onSelect}
      onOpen={onOpen}
      edits={edits}
      {...props}
    />,
  );
  return { ...result, onSelect, onOpen };
}

/** The token rows, without the column header or the group headings. */
const tokenRows = () => [...document.querySelectorAll<HTMLElement>("tr.token")];

/** Each row's path below the scope: its section heading, then its name. */
const rowLabels = () =>
  tokenRows().map((r) => {
    const heading = r.closest("tbody")!.querySelector("tr.section")?.textContent ?? "";
    const name = r.querySelector(".name-cell .cell, .name-cell input.inline")!.textContent!;
    return [...(heading ? heading.split("/") : []), name].join(".");
  });

/** The group headings, in order. */
const headings = () => [...document.querySelectorAll("tr.section")].map((r) => r.textContent);

describe("Table rows", () => {
  it("renders one row per token in the tree, under its group's heading", () => {
    renderTable();
    expect(headings()).toEqual(["color/brand", "space"]);
    expect(rowLabels()).toEqual(["color.brand.primary", "color.brand.accent", "space.md"]);
  });

  it("shows only the leaf name in a row", () => {
    renderTable();
    expect(tokenRows()[0].querySelector(".name-cell")!.textContent).toBe("primary");
  });

  it("lists a group's own tokens before its subgroups, so a group has one heading", () => {
    const root = group(
      [],
      [
        group(
          ["color"],
          [
            token(["color", "a"], 1),
            group(["color", "sub"], [token(["color", "sub", "x"], 1)]),
            token(["color", "b"], 1),
          ],
        ),
      ],
    );
    renderTable({ root });
    expect(headings()).toEqual(["color", "color/sub"]);
    expect(rowLabels()).toEqual(["color.a", "color.b", "color.sub.x"]);
  });

  it("narrows to tokens whose path contains the query, case-insensitively", () => {
    renderTable({ query: "BRAND" });
    expect(headings()).toEqual(["color/brand"]);
    expect(rowLabels()).toEqual(["color.brand.primary", "color.brand.accent"]);
  });

  it("shows the empty message instead of rows when nothing matches", () => {
    renderTable({ query: "nothing-matches-this" });
    expect(screen.queryAllByRole("row")).toHaveLength(0);
    expect(screen.getByText("No matching tokens.")).toBeTruthy();
  });

  it("says something different when the document itself is empty", () => {
    renderTable({ root: group([], []) });
    expect(screen.getByText("No tokens yet.")).toBeTruthy();
  });

  it("shows only the scoped group's tokens, with no heading for the scope itself", () => {
    renderTable({ scopePath: ["color", "brand"] });
    expect(headings()).toEqual([]);
    expect(rowLabels()).toEqual(["primary", "accent"]);
  });

  it("falls back to the whole document when the scoped group is gone", () => {
    // A scope survives in host state after the group it names is renamed or
    // deleted; an empty table would be a dead end.
    renderTable({ scopePath: ["color", "was-renamed"] });
    expect(rowLabels()).toEqual(["color.brand.primary", "color.brand.accent", "space.md"]);
  });
});

describe("Table keyboard", () => {
  const table = () => document.querySelector(".table-wrap")!;

  it("moves the selection down and up, one row per press", () => {
    const { onSelect } = renderTable();
    fireEvent.keyDown(table(), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "primary"]);
    fireEvent.keyDown(table(), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "accent"]);
    fireEvent.keyDown(table(), { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "primary"]);
  });

  it("clamps at the last row instead of wrapping", () => {
    const { onSelect } = renderTable({ selectedKey: "space.md" });
    fireEvent.keyDown(table(), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(["space", "md"]);
  });

  it("clamps at the first row instead of wrapping", () => {
    const { onSelect } = renderTable({ selectedKey: "color.brand.primary" });
    fireEvent.keyDown(table(), { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "primary"]);
  });

  it("opens the selected row on Enter", () => {
    const { onOpen } = renderTable({ selectedKey: "space.md" });
    fireEvent.keyDown(table(), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(["space", "md"]);
  });

  it("jumps to the first and last rows with Home and End", () => {
    const { onSelect } = renderTable({ selectedKey: "color.brand.accent" });
    fireEvent.keyDown(table(), { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(["space", "md"]);
    fireEvent.keyDown(table(), { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "primary"]);
  });

  it("keeps the arrows inside the filtered rows", () => {
    const { onSelect } = renderTable({ query: "brand", selectedKey: "color.brand.accent" });
    fireEvent.keyDown(table(), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(["color", "brand", "accent"]);
  });

  it("ignores keys it does not handle", () => {
    const { onSelect } = renderTable();
    fireEvent.keyDown(table(), { key: "a" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Table selection", () => {
  it("selects the row that was clicked", () => {
    const { onSelect } = renderTable();
    fireEvent.click(tokenRows()[2]);
    expect(onSelect).toHaveBeenCalledWith(["space", "md"]);
  });

  it("opens the row on double click", () => {
    const { onOpen } = renderTable({ root: group([], [token(["lone"], 1)]) });
    fireEvent.doubleClick(tokenRows()[0]);
    expect(onOpen).toHaveBeenCalledWith(["lone"]);
  });
});

describe("Table keyboard reorder", () => {
  const table = () => document.querySelector(".table-wrap")!;

  it("moves the selected token down and up among its siblings with Alt+Arrow", () => {
    renderTable({ selectedKey: "color.brand.primary", scopePath: ["color", "brand"] });
    fireEvent.keyDown(table(), { key: "ArrowDown", altKey: true });
    expect(edits.reorder.mock.calls).toEqual([
      [
        ["color", "brand"],
        ["accent", "primary"],
      ],
    ]);

    cleanup();
    vi.clearAllMocks();
    renderTable({ selectedKey: "color.brand.accent", scopePath: ["color", "brand"] });
    fireEvent.keyDown(table(), { key: "ArrowUp", altKey: true });
    expect(edits.reorder.mock.calls).toEqual([
      [
        ["color", "brand"],
        ["accent", "primary"],
      ],
    ]);
  });

  it("does nothing at either end, and leaves the selection where it was", () => {
    const { onSelect } = renderTable({
      selectedKey: "color.brand.accent",
      scopePath: ["color", "brand"],
    });
    fireEvent.keyDown(table(), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(table(), { key: "ArrowUp", altKey: true });
    expect(edits.reorder).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(table(), { key: "ArrowDown", altKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Table row controls from the keyboard", () => {
  it("puts only the selected row's alias and edit buttons in the Tab order", () => {
    renderTable({
      selectedKey: "color.brand.primary",
      aliasCandidates: [token(["ext", "ink"], "#000000", { type: "color" as TokenType })],
    });
    const rows = tokenRows();
    const tabs = (sel: string) =>
      rows.map((r) => r.querySelector<HTMLElement>(sel)?.tabIndex ?? null);
    expect(tabs("button.edit")).toEqual([0, -1, -1]);
    expect(tabs("button.alias-trigger")).toEqual([0, -1, null]);
  });
});

describe("Table type column", () => {
  it("shows each row's type icon before its type name", () => {
    renderTable();
    const cells = tokenRows().map((r) => r.querySelectorAll("td")[2]);
    expect(cells.map((td) => td.querySelector(".type-icon")?.getAttribute("data-type"))).toEqual([
      "color",
      "color",
      "number",
    ]);
    expect(cells.map((td) => td.textContent)).toEqual(["color", "color", "number"]);
  });
});

describe("Table cell click target", () => {
  /** A click on the `<td>` itself: its padding or the space after the text. */
  const clickCell = (row: number, col: number) => {
    const td = tokenRows()[row].querySelectorAll("td")[col];
    fireEvent.click(td);
    return td;
  };

  it("edits the name, value and description from a click anywhere in the cell", () => {
    renderTable();
    for (const col of [0, 1, 3]) {
      expect(clickCell(0, col).querySelector("input.inline")).toBeTruthy();
      cleanup();
      renderTable();
    }
  });

  it("keeps the row focused, as a click on the text does", () => {
    renderTable();
    document.querySelector<HTMLElement>(".table-wrap")!.focus();
    clickCell(2, 1);
    expect(tokenRows()[2].classList.contains("focused")).toBe(true);
  });

  it("leaves the type cell and a read-only mode cell as they are", () => {
    renderTable();
    clickCell(0, 2);
    expect(document.querySelector("input.inline")).toBeNull();

    cleanup();
    const modes: TableModes = {
      own: "light",
      values: { remote: { "space.md": { value: 8 } } },
      shown: ["light", "remote"],
      setValue: vi.fn(),
    };
    renderTable({ modes, scopePath: ["space"] });
    expect(clickCell(0, 2).querySelector(".cell.readonly")).toBeTruthy();
    expect(document.querySelector("input.inline")).toBeNull();
  });
});
