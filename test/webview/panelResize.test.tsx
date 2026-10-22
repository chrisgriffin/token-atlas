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

import { setPanelWidthState } from "../../src/webview/vscodeApi";
import { App } from "../../src/webview/App";
import { parseTokens } from "../../src/core/parse";

/**
 * The detail panel's edge resizer (#447): an interrupted drag ends, the same
 * shape as the column resizer's (#425). jsdom's window is 1024px wide, so the
 * panel opens at its 440px default and clamps to 300–460px; the width is read
 * from the handle's aria-valuenow.
 */

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
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
  vi.mocked(setPanelWidthState).mockClear();
});

function renderWithPanel() {
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
          selected: ["a"],
        },
      }),
    );
  });
  return screen.getByRole("separator", { name: "Resize panel" });
}

const width = (h: HTMLElement) => Number(h.getAttribute("aria-valuenow"));
// The panel's width is the distance from the pointer to the window's right edge.
const at = (w: number) => ({ clientX: window.innerWidth - w, pointerId: 1 });

describe("panel resizer", () => {
  it("resizes live while dragging and saves once, on release", () => {
    const h = renderWithPanel();
    expect(width(h)).toBe(440);
    fireEvent.pointerDown(h, at(440));
    fireEvent.pointerMove(h, at(400));
    expect(width(h)).toBe(400);
    expect(setPanelWidthState).not.toHaveBeenCalled();
    fireEvent.pointerUp(h, at(380));
    expect(width(h)).toBe(380);
    expect(setPanelWidthState).toHaveBeenCalledTimes(1);
    expect(setPanelWidthState).toHaveBeenLastCalledWith(380);
  });

  it("ends a cancelled drag: later moves leave the panel alone and nothing is saved", () => {
    const h = renderWithPanel();
    fireEvent.pointerDown(h, at(440));
    fireEvent.pointerMove(h, at(400));
    expect(width(h)).toBe(400);
    fireEvent.pointerCancel(h, { pointerId: 1 });
    expect(width(h)).toBe(440);
    fireEvent.pointerMove(h, at(320));
    expect(width(h)).toBe(440);
    expect(setPanelWidthState).not.toHaveBeenCalled();
  });

  it("ends a drag whose pointer capture is lost, as a cancel", () => {
    const h = renderWithPanel();
    fireEvent.pointerDown(h, at(440));
    fireEvent.pointerMove(h, at(400));
    fireEvent.lostPointerCapture(h, { pointerId: 1 });
    fireEvent.pointerMove(h, at(320));
    expect(width(h)).toBe(440);
    expect(setPanelWidthState).not.toHaveBeenCalled();
  });

  it("does not cancel a released drag when the capture is lost after release", () => {
    const h = renderWithPanel();
    fireEvent.pointerDown(h, at(440));
    fireEvent.pointerMove(h, at(400));
    fireEvent.pointerUp(h, at(400));
    fireEvent.lostPointerCapture(h, { pointerId: 1 });
    expect(width(h)).toBe(400);
    expect(setPanelWidthState).toHaveBeenCalledTimes(1);
    expect(setPanelWidthState).toHaveBeenLastCalledWith(400);
  });

  it("widens and narrows the panel by 16px per arrow key, and saves each step", () => {
    const h = renderWithPanel();
    fireEvent.keyDown(h, { key: "ArrowRight" });
    expect(width(h)).toBe(424);
    expect(setPanelWidthState).toHaveBeenLastCalledWith(424);
    fireEvent.keyDown(h, { key: "ArrowLeft" });
    expect(width(h)).toBe(440);
    expect(setPanelWidthState).toHaveBeenLastCalledWith(440);
  });
});
