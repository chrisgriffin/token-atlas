import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import type { GroupNode, TokenNode, ValidationIssue } from "../../core/types"
import type { ColumnWidths, Modes } from "../../shared/protocol"
import { summarize } from "../lib/css"
import { Glyph } from "./Glyph"
import { parseInline } from "../lib/inline"
import { reorderSiblings } from "../lib/reorder"
import { findGroup } from "../lib/groups"
import { InlineCell } from "./InlineCell"
import { DeprecatedPill, InheritedPill } from "./shared"
import { AliasPicker } from "./AliasPicker"
import { wouldCycle } from "../../core/aliases"
import { isReference, referenceTarget } from "../../core/parse"
import { deprecation } from "../../core/validate"
import {
  ChevronDown,
  ErrorIcon,
  Grip,
  Pencil,
  TypeIcon,
  WarningIcon,
} from "../icons"

/** Below these table widths the Description, then the Type, column drops out
 *  so names and values keep their room when the editor group is narrow. */
const SHOW_DESCRIPTION_MIN = 720
const SHOW_TYPE_MIN = 480

type Column = keyof ColumnWidths
const LABELS: Record<Column, string> = {
  name: "Name",
  value: "Value",
  type: "Type",
}
/** Narrowest a resized column may go. */
const MIN: Record<Column, number> = { name: 80, value: 80, type: 64 }
/** The edit column is fixed; the flexible column (Description, or Value when
 *  Description is hidden) keeps at least this much, so a resize never makes
 *  the table scroll sideways. */
const EDIT_WIDTH = 40
const FLEX_MIN = 120
const KEY_STEP = 16

/** A column's default width in px at table width `w`, mirroring the
 *  percentages the colgroup falls back to. */
function defaultWidth(
  col: Column,
  w: number,
  showDescription: boolean,
): number {
  if (col === "name") return w * (showDescription ? 0.24 : 0.36)
  return col === "value" ? w * 0.34 : 110
}

export interface TableEdits {
  /** False refuses the name (a sibling has it): the cell stays open. */
  rename: (path: string[], newName: string) => boolean | void
  setValue: (path: string[], value: unknown) => void
  setDescription: (path: string[], description: string) => void
  /** Full new order of the keys under `parentPath`. */
  reorder: (parentPath: string[], order: string[]) => void
}

/** Drag state: the row being dragged and where it would land. */
interface Drag {
  key: string
  parentKey: string
  overKey: string | null
  after: boolean
}

interface TableProps {
  root: GroupNode
  /** Every token an alias may point at: this file's plus external ones. */
  aliasCandidates: TokenNode[]
  query: string
  /** Show only this group's subtree; empty shows the whole document. */
  scopePath: string[]
  selectedKey: string | null
  /** Validation issues keyed by dotted path. */
  issues: Map<string, ValidationIssue[]>
  onSelect: (path: string[]) => void
  onOpen: (path: string[]) => void
  edits: TableEdits
  /** Saved column widths (px), shared by every token file. */
  columnWidths?: ColumnWidths
  /** A resize finished: the full new set of widths, to save. */
  onColumnWidths?: (widths: ColumnWidths) => void
  /** A mode file's modes: one value column per shown context. */
  modes?: TableModes
}

/** The contexts to show, of a mode file's modes (`Modes`), and where an edit
 *  to another context's cell goes. */
export interface TableModes extends Pick<Modes, "own" | "values"> {
  shown: string[]
  setValue: (context: string, path: string[], value: unknown) => void
}

/** One value cell: a token as one context has it, and where an edit goes;
 *  no `setValue` is read-only. */
interface Cell {
  token: TokenNode
  setValue?: (value: unknown) => void
}

/** `node` as `context` defines it, for a cell outside this file. */
function modeToken(
  node: TokenNode,
  cell: Modes["values"][string][string] | undefined,
): TokenNode {
  const reference = isReference(cell?.value)
    ? referenceTarget(cell.value)
    : undefined
  return {
    ...node,
    value: cell?.value,
    isAlias: reference !== undefined,
    reference,
    resolvedValue: cell?.resolved,
  }
}

/** A token row; `group` is its parent's path below the scope, empty for the
 *  scope's own tokens. */
type Row = { node: TokenNode; key: string; group: string[] }

/** True when a mouse event started inside an inline-editable cell, so row
 *  handlers (select, open panel) leave the edit alone. */
const inEditableCell = (e: MouseEvent) =>
  !!(e.target as HTMLElement).closest(".cell, input.inline")

/** A click on a cell's empty space edits it, as a click on its text does.
 *  A control inside the cell keeps its own click; the focusable table
 *  wrapper around every cell does not count as one. */
const editCellAt = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const td = target.closest("td")
  const control = target.closest("button, input, label, [tabindex]")
  if (!td || (control && td.contains(control))) return
  td.querySelector<HTMLElement>(".cell[tabindex]")?.focus()
}

/** The main token table: collapsible group header rows, one row per token.
 *  A filter query flattens the table to matching tokens with their groups
 *  forced open. */
export function Table({
  root,
  aliasCandidates,
  query,
  scopePath,
  selectedKey,
  issues,
  onSelect,
  onOpen,
  edits,
  columnWidths = {},
  onColumnWidths = () => {},
  modes,
}: TableProps) {
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  // Side by side, the mode columns take Description's room.
  const sideBySide = (modes?.shown.length ?? 1) > 1
  const showDescription = width >= SHOW_DESCRIPTION_MIN && !sideBySide
  const showType = width >= SHOW_TYPE_MIN
  // Name always resizes; Value and Type only while Description is there to
  // take up the slack. The rest keep their defaults.
  const resizable: Column[] = showDescription
    ? ["name", "value", "type"]
    : ["name"]
  /** A column being dragged: its live width, saved on release. */
  const [live, setLive] = useState<ColumnWidths>({})
  const saved = { ...columnWidths, ...live }
  const px = (col: Column) =>
    saved[col] ?? defaultWidth(col, width, showDescription)
  const maxWidth = (col: Column) => {
    const others = (["name", "value", "type"] as Column[])
      .filter(
        c => c !== col && (resizable.includes(c) || (c === "type" && showType)),
      )
      .reduce(
        (sum, c) =>
          sum + (resizable.includes(c) ? px(c) : defaultWidth(c, width, false)),
        0,
      )
    return width - EDIT_WIDTH - FLEX_MIN - others
  }
  const clamp = (col: Column, w: number) =>
    Math.round(Math.max(MIN[col], Math.min(w, maxWidth(col))))
  /** The width a `<col>` asks for: a saved one, clamped, or the default. */
  const colWidth = (col: Column, fallback: string | number | undefined) =>
    resizable.includes(col) && saved[col] !== undefined
      ? clamp(col, saved[col]!)
      : fallback
  const resize = (col: Column) => ({
    live: (w: number) => setLive({ [col]: clamp(col, w) }),
    commit: (w: number) => {
      setLive({})
      onColumnWidths({ ...columnWidths, [col]: clamp(col, w) })
    },
    cancel: () => setLive({}),
    reset: () => {
      setLive({})
      const { [col]: _, ...rest } = columnWidths
      onColumnWidths(rest)
    },
    current: px(col),
    min: MIN[col],
    max: maxWidth(col),
  })
  const q = query.trim().toLowerCase()
  const candidateMap = useMemo(() => {
    const m = new Map<string, TokenNode>()
    for (const t of aliasCandidates) m.set(t.path.join("."), t)
    return m
  }, [aliasCandidates])

  // A scoped group that has since been renamed or deleted falls back to the document.
  const scopeRoot = useMemo(
    () => (scopePath.length ? (findGroup(root, scopePath) ?? root) : root),
    [root, scopePath],
  )

  // The panel does the navigating, so the table never nests: every token
  // under the scope, one section per group, as Figma's variables table does.
  // A group's own tokens come before its subgroups, so each section's rows
  // are contiguous siblings and a row shows only the name you edit. A group
  // with nothing in it gets an empty section, or it could not be seen or
  // opened at all.
  const sections = useMemo(() => {
    const out: { group: string[]; rows: Row[] }[] = []
    const walk = (group: GroupNode, prefix: string[]) => {
      const rows: Row[] = []
      for (const child of group.children) {
        if (child.kind !== "token") continue
        const key = child.path.join(".")
        if (q && !key.toLowerCase().includes(q)) continue
        rows.push({ node: child, key, group: prefix })
      }
      if (rows.length || (!q && prefix.length && !group.children.length))
        out.push({ group: prefix, rows })
      for (const child of group.children)
        if (child.kind === "group") walk(child, [...prefix, child.name])
    }
    walk(scopeRoot, [])
    return out
  }, [scopeRoot, q])
  const rows = useMemo(() => sections.flatMap(s => s.rows), [sections])

  // Drag and Alt+Arrow both reorder within a section, where the rows on
  // screen are the token's real neighbours; a filter breaks that up.
  const canReorder = !q

  // The wrapper element swaps between the table and the empty message, so
  // re-observe whichever one is mounted.
  const empty = sections.length === 0
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = focusKey ?? selectedKey
    const i = rows.findIndex(r => r.key === current)
    const row = i >= 0 ? rows[i] : undefined
    // Alt+Arrow moves the token among its siblings, as Alt+Arrow moves a line
    // in VS Code. Same intent as drag and drop.
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      if (!row || !canReorder) return
      const parentPath = row.node.path.slice(0, -1)
      const children = findGroup(root, parentPath)?.children ?? []
      const siblings = children.map(c => c.name)
      // The neighbour on screen: subgroups are listed in sections of their own.
      const tokens = children.filter(c => c.kind === "token").map(c => c.name)
      const target =
        tokens[tokens.indexOf(row.node.name) + (e.key === "ArrowDown" ? 1 : -1)]
      const order =
        target === undefined
          ? null
          : reorderSiblings(
              siblings,
              row.node.name,
              target,
              e.key === "ArrowDown",
            )
      if (order) edits.reorder(parentPath, order)
      return
    }
    const move = (to: number) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, to))]
      if (!next) return
      setFocusKey(next.key)
      onSelect(next.node.path)
    }
    switch (e.key) {
      case "ArrowDown":
        move(i + 1)
        break
      case "ArrowUp":
        move(i - 1)
        break
      case "Home":
        move(0)
        break
      case "End":
        move(rows.length - 1)
        break
      case "Enter":
        if (row) onOpen(row.node.path)
        break
      default:
        return
    }
    e.preventDefault()
  }

  // Drag and drop reorders a row among its siblings (same parent). Dropping
  // into another group is not supported: that changes the token's path and
  // every reference to it. Disabled while filtering, since rows are then not
  // contiguous siblings.
  const parentKeyOf = (node: TokenNode) => node.path.slice(0, -1).join(".")
  const dragProps = (node: TokenNode, key: string) => {
    if (!canReorder) return {}
    const parentKey = parentKeyOf(node)
    return {
      onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => {
        if (!drag || drag.parentKey !== parentKey || drag.key === key) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        const r = e.currentTarget.getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        if (drag.overKey !== key || drag.after !== after)
          setDrag({ ...drag, overKey: key, after })
      },
      onDrop: (e: React.DragEvent<HTMLTableRowElement>) => {
        e.preventDefault()
        if (!drag || drag.parentKey !== parentKey || drag.key === key) return
        const siblings =
          findGroup(root, node.path.slice(0, -1))?.children.map(c => c.name) ??
          []
        const order = reorderSiblings(
          siblings,
          drag.key.split(".").pop()!,
          key.split(".").pop()!,
          drag.after,
        )
        setDrag(null)
        if (order) edits.reorder(node.path.slice(0, -1), order)
      },
    }
  }
  const handleProps = (node: TokenNode, key: string) =>
    !canReorder
      ? { draggable: false }
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", key)
            // Drag image = the whole row, not just the grip.
            const row = e.currentTarget.closest("tr")
            if (row) e.dataTransfer.setDragImage(row, 0, 0)
            setDrag({
              key,
              parentKey: parentKeyOf(node),
              overKey: null,
              after: false,
            })
          },
          onDragEnd: () => setDrag(null),
        }
  const dropClass = (key: string) =>
    drag?.overKey === key ? (drag.after ? " drop-after" : " drop-before") : ""
  const dragClass = (key: string) => (drag?.key === key ? " dragging" : "")

  if (empty) {
    return (
      <div ref={wrapRef} style={{ padding: 16, opacity: 0.6 }}>
        {q ? "No matching tokens." : "No tokens yet."}
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className="table-wrap"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={() => setFocusKey(null)}
    >
      <table className="tokens">
        <colgroup>
          <col
            style={{ width: colWidth("name", showDescription ? "24%" : "36%") }}
          />
          {sideBySide ? (
            modes!.shown.map(c => <col key={c} />)
          ) : (
            <col
              style={{
                width: colWidth("value", showDescription ? "34%" : undefined),
              }}
            />
          )}
          {showType && <col style={{ width: colWidth("type", 110) }} />}
          {showDescription && <col />}
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr>
            {(["name", "value", "type"] as Column[])
              .filter(col => col !== "type" || showType)
              .flatMap(col =>
                col === "value" && modes
                  ? modes.shown.map(c => ({ col, label: c }))
                  : [{ col, label: LABELS[col] }],
              )
              .map(({ col, label }) => (
                <th
                  key={`${col}:${label}`}
                  className={col === "value" && modes ? "mode-head" : undefined}
                >
                  {label}
                  {resizable.includes(col) &&
                    !(col === "value" && sideBySide) && (
                      <ColumnResizer label={label} {...resize(col)} />
                    )}
                </th>
              ))}
            {showDescription && <th>Description</th>}
            <th aria-label="Edit" />
          </tr>
        </thead>
        {sections.map(({ group, rows: sectionRows }) => (
          <tbody key={group.join(".")}>
            {group.length > 0 && (
              <tr className="section">
                <th
                  scope="rowgroup"
                  // The whole heading is the innermost group's; each parent
                  // name's own context overrides it (spec 022).
                  data-vscode-context={headingContext(root, [
                    ...scopeRoot.path,
                    ...group,
                  ])}
                  colSpan={
                    2 +
                    (modes?.shown.length ?? 1) +
                    Number(showType) +
                    Number(showDescription)
                  }
                >
                  {group.map((seg, i) => {
                    // Each name opens its group's panel. Not a Tab stop, as
                    // the row controls outside the selected row are not.
                    const name = (
                      <button
                        className="section-name"
                        tabIndex={-1}
                        data-vscode-context={headingContext(root, [
                          ...scopeRoot.path,
                          ...group.slice(0, i + 1),
                        ])}
                        title={`Open ${[...scopeRoot.path, ...group.slice(0, i + 1)].join(".")}`}
                        onClick={() =>
                          onOpen([...scopeRoot.path, ...group.slice(0, i + 1)])
                        }
                      >
                        {seg}
                      </button>
                    )
                    return i < group.length - 1 ? (
                      <span key={i} className="section-parent">
                        {name}
                        <span className="section-sep">/</span>
                      </span>
                    ) : (
                      <span key={i}>{name}</span>
                    )
                  })}
                </th>
              </tr>
            )}
            {sectionRows.map(({ node, key }) => (
              <TokenRow
                key={key}
                token={node}
                active={selectedKey === key}
                focused={focusKey === key}
                issues={issues.get(key)}
                showType={showType}
                showDescription={showDescription}
                onClick={() => {
                  setFocusKey(key)
                  onSelect(node.path)
                }}
                onOpen={() => onOpen(node.path)}
                edits={edits}
                cells={
                  modes
                    ? modes.shown.map(c => {
                        if (c === modes.own)
                          return {
                            token: node,
                            setValue: v => edits.setValue(node.path, v),
                          }
                        const cell = modes.values[c]?.[key]
                        return {
                          token: modeToken(node, cell),
                          setValue: cell?.file
                            ? v => modes.setValue(c, node.path, v)
                            : undefined,
                        }
                      })
                    : [
                        {
                          token: node,
                          setValue: v => edits.setValue(node.path, v),
                        },
                      ]
                }
                candidates={aliasCandidates}
                candidateMap={candidateMap}
                rowProps={dragProps(node, key)}
                gripProps={handleProps(node, key)}
                extraClass={dropClass(key) + dragClass(key)}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** Severity icon after a row's name; hover lists the messages, click opens the
 *  panel, which shows them too. Unlike the selected row's edit button it is not a tab
 *  stop: keyboard users reach the same Problems section with Enter on the row.
 *  The label is the count and `title` supplies the messages as its description,
 *  so screen readers announce them once. */
function IssueMark({
  issues,
  onOpen,
}: {
  issues?: ValidationIssue[]
  onOpen: () => void
}) {
  if (!issues?.length) return null
  const error = issues.some(i => i.severity === "error")
  const messages = issues.map(i => i.message).join("\n")
  return (
    <button
      className={`ghost issue-mark ${error ? "sev-error" : "sev-warning"}`}
      tabIndex={-1}
      title={messages}
      aria-label={`${issues.length} ${issues.length === 1 ? "problem" : "problems"}`}
      onClick={e => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {error ? <ErrorIcon /> : <WarningIcon />}
    </button>
  )
}

function TokenRow({
  token,
  active,
  focused,
  issues,
  showType,
  showDescription,
  onClick,
  onOpen,
  edits,
  cells,
  candidates,
  candidateMap,
  rowProps,
  gripProps,
  extraClass,
}: {
  token: TokenNode
  active: boolean
  focused: boolean
  issues?: ValidationIssue[]
  showType: boolean
  showDescription: boolean
  onClick: () => void
  onOpen: () => void
  edits: TableEdits
  /** The value columns: this file's, or one per shown mode. */
  cells: Cell[]
  candidates: TokenNode[]
  candidateMap: Map<string, TokenNode>
  rowProps: React.HTMLAttributes<HTMLTableRowElement>
  gripProps: React.HTMLAttributes<HTMLSpanElement>
  extraClass: string
}) {
  const type = token.resolvedType ?? token.type
  return (
    <tr
      className={`token${active ? " active" : ""}${focused ? " focused" : ""}${extraClass}`}
      {...rowProps}
      data-vscode-context={rowContext(token)}
      onClick={e => {
        // Focus first: moving focus blurs the table wrapper, which clears the
        // row's focus, and onClick then sets it again.
        editCellAt(e)
        onClick()
      }}
      onDoubleClick={e => {
        if (!inEditableCell(e)) onOpen()
      }}
    >
      <td>
        <div className="name-cell">
          <span
            className="grip"
            title="Drag, or Alt+↑/↓, to reorder"
            {...gripProps}
          >
            <Grip />
          </span>
          <InlineCell
            grow
            text={token.name}
            title={token.path.join(".")}
            tabbable={active}
            commit={t => {
              const n = t.trim()
              // An inherited token has no key of its own to rename.
              if (token.inheritedFrom) return false
              if (!n || n.includes(".") || n.includes("{") || n.includes("}"))
                return false
              return edits.rename(token.path, n) !== false
            }}
          />
          <InheritedPill from={token.inheritedFrom} />
          <DeprecatedPill value={token.deprecated} />
          <IssueMark issues={issues} onOpen={onOpen} />
        </div>
      </td>
      {cells.map((cell, i) => (
        <td key={i}>
          <ValueCell
            {...cell}
            compact={cells.length > 1}
            candidates={candidates}
            candidateMap={candidateMap}
            tabbable={active}
          />
        </td>
      ))}
      {showType && (
        <td>
          <span className="cell type-cell">
            <TypeIcon type={type} />
            {type ?? "—"}
          </span>
        </td>
      )}
      {showDescription && (
        <td>
          <InlineCell
            className="dim"
            tabbable={active}
            text={token.description ?? ""}
            placeholder="Description"
            commit={t => {
              edits.setDescription(token.path, t.trim())
              return true
            }}
          />
        </td>
      )}
      <td className="edit-cell">
        <button
          className="ghost edit"
          tabIndex={active ? 0 : -1}
          title="Edit"
          aria-label={`Edit ${token.name}`}
          onClick={e => {
            e.stopPropagation()
            onOpen()
          }}
        >
          <Pencil />
        </button>
      </td>
    </tr>
  )
}

/**
 * What a right-click on a group heading, or a name in one, tells the menu
 * (spec 022). A group `$extends` alone gives (`inheritedFrom`) has no key of
 * its own to rename or delete, so it is the inherited section, as an
 * inherited token is.
 */
function headingContext(root: GroupNode, path: string[]): string {
  return JSON.stringify(
    findGroup(root, path)?.inheritedFrom
      ? { webviewSection: "inherited", path }
      : { webviewSection: "group", path },
  )
}

/**
 * What a right-click on the row tells VS Code's `webview/context` menu
 * (spec 022): its section, its path, and whether it is deprecated. An
 * inherited token has no key of its own, so it is a section of its own.
 */
function rowContext(token: TokenNode): string {
  return JSON.stringify(
    token.inheritedFrom
      ? { webviewSection: "inherited", path: token.path }
      : {
          webviewSection: "token",
          path: token.path,
          tokenDeprecated: deprecation(token) !== undefined,
        },
  )
}

/** A token's value as one column shows it: inline edit, swatch picker and
 *  alias picker, or the value alone when `setValue` is unset (read-only).
 *  `compact`, for side-by-side mode columns, puts an alias's resolved swatch
 *  in front of its chip and its resolved value in the tooltip. */
function ValueCell({
  token,
  setValue,
  compact,
  candidates,
  candidateMap,
  tabbable,
}: Cell & {
  compact: boolean
  candidates: TokenNode[]
  candidateMap: Map<string, TokenNode>
  tabbable: boolean
}) {
  const type = token.resolvedType ?? token.type
  const resolved = token.resolvedValue
  const resolvedText = resolved === undefined ? "" : summarize(resolved, type)
  // A `$ref` into another token's value (a property reference) holds the
  // pointer object as its value; what it stands for is the resolved value.
  const value = token.valueFromRef ? resolved : token.value
  const text = token.isAlias
    ? `{${token.reference}}`
    : summarize(value, token.type)
  const shown = token.isAlias ? (
    <>
      {compact && <Glyph value={resolved} type={type} />}
      <span className="chip">{text}</span>
    </>
  ) : value === undefined ? undefined : (
    <>
      <Glyph
        value={value}
        type={token.type}
        onPick={setValue && token.type === "color" ? setValue : undefined}
        tabbable={tabbable}
      />
      {text}
    </>
  )
  const title = token.isAlias
    ? `${token.reference}${compact ? ` → ${resolvedText || "unresolved"}` : ""}`
    : undefined
  return (
    <div className="value-cell">
      {setValue ? (
        <InlineCell
          mono
          text={text}
          placeholder="—"
          tabbable={tabbable}
          title={title ?? "Click to edit"}
          commit={t => {
            const parsed = parseInline(t, token.type, value)
            if (parsed === undefined) return false
            setValue(parsed)
            return true
          }}
        >
          {shown}
        </InlineCell>
      ) : (
        <span
          className="cell mono readonly"
          title={title ?? "Read-only: no file of this mode's own to write"}
        >
          {shown ?? "—"}
        </span>
      )}
      {token.isAlias &&
        !compact &&
        (resolved === undefined ? (
          <span className="resolved sev-error">unresolved</span>
        ) : (
          <span className="resolved mono" title={resolvedText}>
            <span className="arrow">→</span>
            <Glyph value={resolved} type={type} />
            {resolvedText}
          </span>
        ))}
      {setValue && (
        <AliasSelect
          token={token}
          candidates={candidates}
          candidateMap={candidateMap}
          tabbable={tabbable}
          onPick={ref => setValue(`{${ref}}`)}
        />
      )}
    </div>
  )
}

/** Chevron that opens a popover listing tokens this one may alias: same
 *  type (any type if this token is untyped), not itself, no cycles. Rows
 *  show a swatch and the monospace path, with a search box. */
function AliasSelect({
  token,
  candidates,
  candidateMap,
  tabbable,
  onPick,
}: {
  token: TokenNode
  candidates: TokenNode[]
  candidateMap: Map<string, TokenNode>
  /** In the Tab order: true for the selected row only. */
  tabbable: boolean
  onPick: (reference: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const wrap = useRef<HTMLSpanElement>(null)
  const type = token.resolvedType ?? token.type
  const self = token.path.join(".")
  const options = useMemo(
    () =>
      candidates.filter(t => {
        const key = t.path.join(".")
        if (key === self) return false
        if (type && (t.resolvedType ?? t.type) !== type) return false
        return !wouldCycle(candidateMap, self, key)
      }),
    [candidates, candidateMap, self, type],
  )

  // The table cell clips overflow, so the popover is fixed to the viewport
  // below the trigger and follows it on scroll. Close on outside click.
  const place = () => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(380, window.innerWidth * 0.8)
    setPos({
      top: r.bottom + 4,
      left: Math.max(
        8,
        Math.min(r.right - width, window.innerWidth - width - 8),
      ),
    })
  }
  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [open])

  const toggle = () => {
    place()
    setOpen(o => !o)
  }

  if (options.length === 0) return null
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <span
      ref={wrap}
      className="alias-wrap"
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      onKeyDown={e => {
        if (e.key === "Escape") setOpen(false)
        e.stopPropagation()
      }}
    >
      <button
        className="ghost alias-trigger"
        tabIndex={tabbable ? 0 : -1}
        title={
          type ? `Alias to another ${type} token` : "Alias to another token"
        }
        aria-label="Alias to another token"
        aria-expanded={open}
        onClick={toggle}
      >
        <ChevronDown />
      </button>
      {open && (
        <div
          className="alias-popover"
          role="dialog"
          aria-label="Choose a token to alias"
          style={{ top: pos.top, left: pos.left }}
        >
          <AliasPicker
            autoFocus
            tokens={options}
            currentPath={token.path}
            currentType={token.type}
            selectedRef={token.reference}
            onPick={ref => {
              onPick(ref)
              setOpen(false)
            }}
          />
        </div>
      )}
    </span>
  )
}

/** Drag handle on a header cell's right border. Dragging resizes live and
 *  saves on release; a cancelled drag, or one that loses pointer capture,
 *  drops back to the saved width; ← / → resize by 16px and save; double-click
 *  resets the column to its default. The same shape as the side panel's
 *  resizer. */
function ColumnResizer({
  label,
  live,
  commit,
  cancel,
  reset,
  current,
  min,
  max,
}: {
  label: string
  live: (w: number) => void
  commit: (w: number) => void
  cancel: () => void
  reset: () => void
  current: number
  min: number
  max: number
}) {
  const start = useRef<{ x: number; w: number } | null>(null)
  // The header cell's rendered width: what a drag starts from when the
  // column still has its percentage default.
  const rendered = (el: HTMLElement) =>
    el.parentElement?.getBoundingClientRect().width ?? current
  const startWidth = (el: HTMLElement) =>
    Number.isFinite(current) ? current : rendered(el)
  // A release clears `start` first, so the capture it then loses ends nothing.
  const abort = () => {
    if (!start.current) return
    start.current = null
    cancel()
  }
  return (
    <div
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={Number.isFinite(current) ? Math.round(current) : undefined}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? Math.round(max) : undefined}
      tabIndex={0}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: rendered(e.currentTarget) }
      }}
      onPointerMove={e => {
        if (start.current) live(start.current.w + e.clientX - start.current.x)
      }}
      onPointerUp={e => {
        if (!start.current) return
        const w = start.current.w + e.clientX - start.current.x
        start.current = null
        commit(w)
      }}
      onPointerCancel={abort}
      onLostPointerCapture={abort}
      onDoubleClick={reset}
      onKeyDown={e => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        e.stopPropagation()
        commit(
          startWidth(e.currentTarget) +
            (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP),
        )
      }}
    />
  )
}
