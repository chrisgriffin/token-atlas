import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Table } from "../../src/webview/components/Table";
import { group, sampleRoot, token } from "./fixtures";

/**
 * Alt+↑/↓ reorders only where drag does: within a group's section, with no
 * filter. A filter leaves gaps, so the rows on screen are not the token's real
 * neighbours and a move would happen out of sight (#358).
 */

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function pressAltDown(props: Partial<Parameters<typeof Table>[0]>) {
  const edits = { rename: vi.fn(), setValue: vi.fn(), setDescription: vi.fn(), reorder: vi.fn() };
  const onSelect = vi.fn();
  render(
    <Table
      root={sampleRoot()}
      aliasCandidates={[]}
      query=""
      scopePath={[]}
      selectedKey="color.brand.primary"
      issues={new Map()}
      onSelect={onSelect}
      onOpen={vi.fn()}
      edits={edits}
      {...props}
    />,
  );
  fireEvent.keyDown(document.querySelector(".table-wrap")!, { key: "ArrowDown", altKey: true });
  return { reorder: edits.reorder, onSelect };
}

describe("Alt+Arrow reorder gating", () => {
  it("reorders among plain siblings", () => {
    const { reorder } = pressAltDown({ scopePath: ["color", "brand"] });
    expect(reorder.mock.calls).toEqual([
      [
        ["color", "brand"],
        ["accent", "primary"],
      ],
    ]);
  });

  it("does nothing while the table is filtered", () => {
    const { reorder, onSelect } = pressAltDown({ scopePath: ["color", "brand"], query: "a" });
    expect(reorder).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reorders within a group's section when the scope holds nested groups", () => {
    const { reorder } = pressAltDown({ scopePath: [] });
    expect(reorder.mock.calls).toEqual([
      [
        ["color", "brand"],
        ["accent", "primary"],
      ],
    ]);
  });

  it("steps over a subgroup, which is listed in a section of its own", () => {
    const root = group(
      [],
      [token(["a"], 1), group(["sub"], [token(["sub", "x"], 1)]), token(["b"], 1)],
    );
    const { reorder } = pressAltDown({ root, selectedKey: "a" });
    expect(reorder.mock.calls).toEqual([[[], ["sub", "b", "a"]]]);
  });
});
