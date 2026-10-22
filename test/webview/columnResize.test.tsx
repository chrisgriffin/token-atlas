import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(() => null),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}));

import { post } from "../../src/webview/vscodeApi";
import { App } from "../../src/webview/App";
import { Table } from "../../src/webview/components/Table";
import type { ColumnWidths } from "../../src/shared/protocol";
import { parseTokens } from "../../src/core/parse";
import { sampleRoot } from "./fixtures";

/**
 * Resizable columns (#365). jsdom has no layout, so the table's width comes
 * from a ResizeObserver stub and a header cell's rendered width from a
 * getBoundingClientRect stub; what is asserted is the width each `<col>` asks
 * for and what reaches `onColumnWidths`.
 */

let tableWidth = 1000;
let headerWidth = 240;

beforeEach(() => {
  tableWidth = 1000;
  headerWidth = 240;
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb(
        [{ contentRect: { width: tableWidth } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: headerWidth }) as DOMRect,
  );
  Element.prototype.setPointerCapture = vi.fn();
  // jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX.
  globalThis.PointerEvent ??= class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  } as unknown as typeof PointerEvent;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(post).mockClear();
});

const edits = { rename: vi.fn(), setValue: vi.fn(), setDescription: vi.fn(), reorder: vi.fn() };

function renderTable(columnWidths: ColumnWidths = {}) {
  const onColumnWidths = vi.fn();
  render(
    <Table
      root={sampleRoot()}
      aliasCandidates={[]}
      query=""
      scopePath={[]}
      selectedKey={null}
      issues={new Map()}
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      edits={edits}
      columnWidths={columnWidths}
      onColumnWidths={onColumnWidths}
    />,
  );
  return onColumnWidths;
}

const colWidths = () =>
  [...document.querySelectorAll("table.tokens col")].map((c) => (c as HTMLElement).style.width);
const handle = (name: string) => screen.getByRole("separator", { name: `Resize ${name} column` });

describe("column widths", () => {
  it("lays saved widths over the defaults", () => {
    renderTable({ name: 300, value: 250, type: 90 });
    expect(colWidths()).toEqual(["300px", "250px", "90px", "", "40px"]);
  });

  it("puts a handle on Name, Value and Type, and none on the flexible Description", () => {
    renderTable();
    expect(screen.getAllByRole("separator").map((s) => s.getAttribute("aria-label"))).toEqual([
      "Resize Name column",
      "Resize Value column",
      "Resize Type column",
    ]);
  });

  it("leaves only the Name handle once Description is hidden and Value takes the room", () => {
    tableWidth = 600;
    renderTable({ name: 200, value: 250 });
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(colWidths()).toEqual(["200px", "", "110px", "40px"]);
  });

  it("widens and narrows a column by 16px per arrow key, and saves each step", () => {
    headerWidth = 300;
    const onColumnWidths = renderTable({ name: 300, value: 250 });
    fireEvent.keyDown(handle("Name"), { key: "ArrowRight" });
    expect(onColumnWidths).toHaveBeenLastCalledWith({ name: 316, value: 250 });
    fireEvent.keyDown(handle("Value"), { key: "ArrowLeft" });
    expect(onColumnWidths).toHaveBeenLastCalledWith({ name: 300, value: 234 });
  });

  it("resizes live while dragging and saves once, on release", () => {
    headerWidth = 300;
    const onColumnWidths = renderTable({ name: 300 });
    const h = handle("Name");
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 160, pointerId: 1 });
    expect(colWidths()[0]).toBe("360px");
    expect(onColumnWidths).not.toHaveBeenCalled();
    fireEvent.pointerUp(h, { clientX: 160, pointerId: 1 });
    expect(onColumnWidths).toHaveBeenCalledTimes(1);
    expect(onColumnWidths).toHaveBeenLastCalledWith({ name: 360 });
  });

  it("ends a cancelled drag: later moves leave the column alone and nothing is saved", () => {
    headerWidth = 300;
    const onColumnWidths = renderTable({ name: 300 });
    const h = handle("Name");
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 160, pointerId: 1 });
    expect(colWidths()[0]).toBe("360px");
    fireEvent.pointerCancel(h, { pointerId: 1 });
    expect(colWidths()[0]).toBe("300px");
    fireEvent.pointerMove(h, { clientX: 200, pointerId: 1 });
    expect(colWidths()[0]).toBe("300px");
    expect(onColumnWidths).not.toHaveBeenCalled();
  });

  it("ends a drag whose pointer capture is lost, as a cancel", () => {
    headerWidth = 300;
    const onColumnWidths = renderTable({ name: 300 });
    const h = handle("Name");
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 160, pointerId: 1 });
    fireEvent.lostPointerCapture(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 200, pointerId: 1 });
    expect(colWidths()[0]).toBe("300px");
    expect(onColumnWidths).not.toHaveBeenCalled();
  });

  it("does not cancel a released drag when the capture is lost after release", () => {
    headerWidth = 300;
    const onColumnWidths = renderTable({ name: 300 });
    const h = handle("Name");
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(h, { clientX: 160, pointerId: 1 });
    fireEvent.lostPointerCapture(h, { pointerId: 1 });
    expect(onColumnWidths).toHaveBeenCalledTimes(1);
    expect(onColumnWidths).toHaveBeenLastCalledWith({ name: 360 });
  });

  it("resets a column to its default on double-click", () => {
    const onColumnWidths = renderTable({ name: 300, value: 250 });
    fireEvent.doubleClick(handle("Name"));
    expect(onColumnWidths).toHaveBeenLastCalledWith({ value: 250 });
  });

  it("never lets a column squeeze the flexible one below 120px or go under its minimum", () => {
    // 1000 - 40 edit - 120 flexible - 250 value - 110 type = 480 at most.
    headerWidth = 470;
    const onColumnWidths = renderTable({ name: 470, value: 250 });
    fireEvent.keyDown(handle("Name"), { key: "ArrowRight" });
    expect(onColumnWidths).toHaveBeenLastCalledWith({ name: 480, value: 250 });
    expect(handle("Name").getAttribute("aria-valuemax")).toBe("480");
  });

  it("never narrows a column below its minimum", () => {
    const onColumnWidths = renderTable({ type: 70 });
    fireEvent.keyDown(handle("Type"), { key: "ArrowLeft" });
    expect(onColumnWidths).toHaveBeenLastCalledWith({ type: 64 });
  });

  it("clamps a saved width that no longer fits the table", () => {
    renderTable({ name: 900, value: 250 });
    expect(colWidths()[0]).toBe("480px");
  });

  it("gives a name its full dotted path as its hover title", () => {
    renderTable();
    const names = [...document.querySelectorAll(".name-cell .cell")].map(
      (c) => (c as HTMLElement).title,
    );
    expect(names).toEqual(["color.brand.primary", "color.brand.accent", "space.md"]);
  });
});

describe("App and column widths", () => {
  it("opens with the widths the host sends, and sends a resize back as an intent", () => {
    headerWidth = 300;
    render(<App />);
    const { root } = parseTokens(JSON.stringify({ a: { $type: "color", $value: "#000" } }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "init",
            model: { root },
            validation: { issues: [] },
            externalTokens: [],
            settings: { rootFontSize: 16, defaultColorSpace: "srgb", defaultDimensionUnit: "px" },
            scope: [],
            columnWidths: { name: 300 },
          },
        }),
      );
    });
    expect(colWidths()[0]).toBe("300px");

    fireEvent.keyDown(handle("Name"), { key: "ArrowRight" });
    expect(post).toHaveBeenLastCalledWith({ type: "setColumnWidths", widths: { name: 316 } });
    expect(colWidths()[0]).toBe("316px");
  });
});
