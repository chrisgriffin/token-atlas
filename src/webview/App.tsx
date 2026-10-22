import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnWidths, HostToWebview, Modes, ModeView } from "../shared/protocol";
import type {
  GroupNode,
  TokenDocumentModel,
  TokenNode,
  ValidationIssue,
  ValidationResult,
} from "../core/types";
import {
  post,
  getPanelWidth,
  getSelectedPath,
  setPanelWidthState,
  setSelectedPathState,
} from "./vscodeApi";
import { setSettings } from "./lib/settings";
import { Table } from "./components/Table";
import { Detail } from "./components/Detail";
import { GroupDetail } from "./components/GroupDetail";
import { Issues } from "./components/Issues";
import { Braces, Close, ModeColumns, ModeSingle } from "./icons";
import { listGroups } from "./lib/groups";

const PANEL_DEFAULT = 440;
export const PANEL_MIN = 300;
export const PANEL_MAX_SHARE = 0.45;

export function clampPanelWidth(w: number, viewportWidth: number): number {
  return Math.round(Math.max(PANEL_MIN, Math.min(w, viewportWidth * PANEL_MAX_SHARE)));
}

export function App() {
  const [model, setModel] = useState<TokenDocumentModel | null>(null);
  const [validation, setValidation] = useState<ValidationResult>({ issues: [] });
  const [externalTokens, setExternalTokens] = useState<TokenNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string[] | null>(() => getSelectedPath());
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});
  const [modes, setModes] = useState<Modes | undefined>();
  const [modeView, setModeView] = useState<ModeView>("single");

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg.type === "scope") {
        setScope(msg.path.join("."));
        // The panel clicked a token, not a group: show it.
        if (msg.select) {
          setSelectedPath(msg.select);
          setPanelOpen(true);
        }
      } else if (msg.type === "init" || msg.type === "update") {
        setSettings(msg.settings);
        setScope(msg.scope.join("."));
        // Only ever sent on `init`, so a later update cannot re-open a panel
        // the user has closed.
        if (msg.selected) {
          setSelectedPath(msg.selected);
          setPanelOpen(true);
        }
        // From `init` only: an `update` landing mid-drag must not snap a
        // column back to the width saved before it.
        if (msg.type === "init") setColumnWidths(msg.columnWidths ?? {});
        setModel(msg.model);
        setValidation(msg.validation);
        setExternalTokens(msg.externalTokens);
        setModes(msg.modes);
        setModeView(msg.settings.modeView);
        setError(null);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };
    window.addEventListener("message", handler);
    post({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    setSelectedPathState(selectedPath);
  }, [selectedPath]);

  const selected = useMemo(
    () => (model && selectedPath ? findNode(model.root, selectedPath) : null),
    [model, selectedPath],
  );

  const allTokens = useMemo(() => (model ? flattenTokens(model.root) : []), [model]);
  const groups = useMemo(() => (model ? listGroups(model.root) : []), [model]);
  const scopeExists = groups.some((g) => g.key === scope);
  const activeScope = scopeExists ? scope : "";
  const aliasCandidates = useMemo(
    () => [...allTokens, ...externalTokens],
    [allTokens, externalTokens],
  );
  const issuesByPath = useMemo(() => {
    const m = new Map<string, ValidationIssue[]>();
    for (const issue of validation.issues) {
      const key = issue.path.join(".");
      m.set(key, [...(m.get(key) ?? []), issue]);
    }
    return m;
  }, [validation]);

  const [panelWidth, setPanelWidth] = useState(() => getPanelWidth() ?? PANEL_DEFAULT);
  // The cap keeps the table usable however wide the panel was dragged.
  const panelCss = `clamp(${PANEL_MIN}px, ${panelWidth}px, ${PANEL_MAX_SHARE * 100}vw)`;

  const open = (path: string[]) => {
    setSelectedPath(path);
    setPanelOpen(true);
  };

  const addNode = (kind: "token" | "group") => {
    if (!model) return;
    // Add inside a selected group, beside a selected token, or at the root.
    const parentPath =
      selected?.kind === "group" ? selected.path : selectedPath ? selectedPath.slice(0, -1) : [];
    const siblings = siblingNames(model.root, parentPath);
    const name = uniqueName(kind === "token" ? "token" : "group", siblings);
    post({ type: kind === "token" ? "addToken" : "addGroup", parentPath, name });
    if (kind === "token") open([...parentPath, name]);
  };

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ margin: "0 0 12px", color: "var(--vscode-errorForeground)" }}>
          Could not read tokens: {error}
        </p>
        <button className="secondary" onClick={() => post({ type: "openAsText" })}>
          <Braces />
          Open as JSON
        </button>
      </div>
    );
  }

  if (!model) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Loading tokens…</div>;
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && panelOpen) setPanelOpen(false);
      }}
    >
      <div className="toolbar">
        <input
          placeholder="Filter tokens…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 240 }}
        />
        {activeScope && (
          <span className="scope-chip" title={`Showing ${activeScope}`}>
            {activeScope}
            <button
              className="ghost"
              onClick={() => {
                setScope("");
                post({ type: "setScope", path: [] });
              }}
              title="Show all tokens"
              aria-label="Show all tokens"
            >
              <Close />
            </button>
          </span>
        )}
        <button className="secondary" onClick={() => addNode("token")}>
          + Token
        </button>
        <button className="secondary" onClick={() => addNode("group")}>
          + Group
        </button>
        {modes && (
          <div className="mode-bar">
            {modeView === "single" && (
              <label className="mode-label">
                {modes.modifier}
                <select
                  className="mode-select"
                  value={modes.active}
                  onChange={(e) => {
                    // Shown at once; the host makes it the active resolution.
                    setModes({ ...modes, active: e.target.value });
                    post({ type: "setMode", context: e.target.value });
                  }}
                >
                  {modes.contexts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="seg" role="radiogroup" aria-label="Mode view">
              {(
                [
                  ["single", "One mode at a time", <ModeSingle key="s" />],
                  ["sideBySide", "Every mode side by side", <ModeColumns key="c" />],
                ] as const
              ).map(([view, label, icon]) => (
                <button
                  key={view}
                  role="radio"
                  aria-checked={modeView === view}
                  aria-label={label}
                  title={label}
                  className={modeView === view ? "on" : ""}
                  onClick={() => {
                    setModeView(view);
                    post({ type: "setModeView", view });
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          className="ghost"
          style={{ marginLeft: modes ? undefined : "auto" }}
          onClick={() => post({ type: "openAsText" })}
          title="Open as JSON"
          aria-label="Open as JSON"
        >
          <Braces />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
          <Table
            root={model.root}
            aliasCandidates={aliasCandidates}
            query={query}
            scopePath={activeScope ? activeScope.split(".") : []}
            selectedKey={selectedPath?.join(".") ?? null}
            issues={issuesByPath}
            onSelect={setSelectedPath}
            onOpen={open}
            edits={{
              rename: (path, newName) => {
                post({ type: "renameNode", path, newName });
                setSelectedPath([...path.slice(0, -1), newName]);
              },
              setValue: (path, value) => post({ type: "setValue", path, value }),
              setDescription: (path, description) =>
                post({ type: "setDescription", path, description }),
              reorder: (parentPath, order) => post({ type: "reorderNodes", parentPath, order }),
            }}
            columnWidths={columnWidths}
            onColumnWidths={(widths) => {
              setColumnWidths(widths);
              post({ type: "setColumnWidths", widths });
            }}
            modes={
              modes && {
                own: modes.own,
                values: modes.values,
                shown: modeView === "sideBySide" ? modes.contexts : [modes.active],
                setValue: (context, path, value) =>
                  post({ type: "setModeValue", context, path, value }),
              }
            }
          />
        </main>
        {panelOpen && selected && (
          <PanelResizer
            right={panelCss}
            width={panelWidth}
            onResize={setPanelWidth}
            onCommit={(w) => setPanelWidthState(w)}
          />
        )}
        {panelOpen && selected?.kind === "group" && (
          <aside className="panel" style={{ width: panelCss }}>
            <GroupDetail
              key={selected.path.join(".")}
              group={selected}
              issues={issuesByPath.get(selected.path.join("."))}
              onClose={() => setPanelOpen(false)}
              onOpenPath={open}
              onChangeDescription={(description) =>
                post({ type: "setDescription", path: selected.path, description })
              }
              onRename={(newName) => post({ type: "renameNode", path: selected.path, newName })}
              onDelete={() => {
                post({ type: "deleteNode", path: selected.path });
                setSelectedPath(null);
                setPanelOpen(false);
              }}
              onMove={(direction) => post({ type: "moveNode", path: selected.path, direction })}
              onChangeDeprecated={(deprecated) =>
                post({ type: "setDeprecated", path: selected.path, deprecated })
              }
              onChangeType={(tokenType, starterValue) =>
                post({ type: "setType", path: selected.path, tokenType, starterValue })
              }
            />
          </aside>
        )}
        {panelOpen && selected?.kind === "token" && (
          <aside className="panel" style={{ width: panelCss }}>
            <Detail
              key={selected.path.join(".")}
              token={selected}
              issues={issuesByPath.get(selected.path.join("."))}
              allTokens={allTokens}
              externalTokens={externalTokens}
              onClose={() => setPanelOpen(false)}
              onOpenPath={open}
              onChangeValue={(value) => post({ type: "setValue", path: selected.path, value })}
              onChangeDescription={(description) =>
                post({ type: "setDescription", path: selected.path, description })
              }
              onRename={(newName) => post({ type: "renameNode", path: selected.path, newName })}
              onDelete={() => {
                post({ type: "deleteNode", path: selected.path });
                setSelectedPath(null);
                setPanelOpen(false);
              }}
              onMove={(direction) => post({ type: "moveNode", path: selected.path, direction })}
              onChangeDeprecated={(deprecated) =>
                post({ type: "setDeprecated", path: selected.path, deprecated })
              }
              onChangeType={(tokenType, starterValue) =>
                post({ type: "setType", path: selected.path, tokenType, starterValue })
              }
            />
          </aside>
        )}
      </div>

      <Issues validation={validation} onSelect={open} />
    </div>
  );
}

/** Drag handle on the panel's left edge. Dragging and arrow keys resize;
 *  double-click restores the default. The width is saved when a drag is
 *  released; a cancelled drag, or one that loses pointer capture, drops back
 *  to the width it started from (#447). */
function PanelResizer({
  right,
  width,
  onResize,
  onCommit,
}: {
  /** The panel's CSS width: the handle sits on its left edge. */
  right: string;
  width: number;
  onResize: (w: number) => void;
  onCommit: (w: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  // The width a drag started from; null when no drag is in progress.
  const start = useRef<number | null>(null);
  const clamp = (w: number) => clampPanelWidth(w, window.innerWidth);
  const set = (w: number) => {
    const next = clamp(w);
    onResize(next);
    return next;
  };
  // A release clears `start` first, so the capture it then loses ends nothing.
  const abort = () => {
    if (start.current === null) return;
    onResize(start.current);
    start.current = null;
    setDragging(false);
  };
  return (
    <div
      className={`panel-resizer${dragging ? " dragging" : ""}`}
      style={{ right }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={clamp(width)}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={clamp(Infinity)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = width;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (start.current !== null) set(window.innerWidth - e.clientX);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        start.current = null;
        setDragging(false);
        onCommit(set(window.innerWidth - e.clientX));
      }}
      onPointerCancel={abort}
      onLostPointerCapture={abort}
      onDoubleClick={() => onCommit(set(PANEL_DEFAULT))}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onCommit(set(clamp(width) + (e.key === "ArrowLeft" ? 16 : -16)));
      }}
    />
  );
}

export function siblingNames(root: GroupNode, parentPath: string[]): Set<string> {
  let current: GroupNode = root;
  for (const segment of parentPath) {
    const next = current.children.find((c) => c.kind === "group" && c.name === segment);
    if (!next || next.kind !== "group") return new Set();
    current = next;
  }
  return new Set(current.children.map((c) => c.name));
}

export function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 1;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/** All tokens in document order (the alias picker shows this order). */
export function flattenTokens(node: GroupNode): TokenNode[] {
  const out: TokenNode[] = [];
  for (const child of node.children) {
    if (child.kind === "token") out.push(child);
    else out.push(...flattenTokens(child));
  }
  return out;
}

export function findNode(node: GroupNode, path: string[]): GroupNode | TokenNode | null {
  let current: GroupNode | TokenNode = node;
  for (const segment of path) {
    if (current.kind !== "group") return null;
    const next: GroupNode | TokenNode | undefined = current.children.find(
      (c) => c.name === segment,
    );
    if (!next) return null;
    current = next;
  }
  return current === node ? null : current;
}
