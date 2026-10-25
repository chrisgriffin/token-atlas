import type { GroupNode, TokenType, ValidationIssue } from "../../core/types"
import { countTokens } from "../../core/parse"
import { TextInput } from "../editors/fields"
import {
  DeprecatedField,
  DeprecatedPill,
  NodeHeader,
  Problems,
  Section,
  TypeSelect,
} from "./shared"

interface GroupDetailProps {
  group: GroupNode
  issues?: ValidationIssue[]
  onChangeDescription: (description: string) => void
  onRename: (newName: string) => void
  onDelete: () => void
  onMove: (direction: "up" | "down") => void
  onClose: () => void
  /** Opens a group from the header's breadcrumb. */
  onOpenPath?: (path: string[]) => void
  onChangeDeprecated: (deprecated: boolean | string | undefined) => void
  onChangeType: (type: TokenType | undefined, starterValue?: unknown) => void
}

/** Right-panel editor for a group: rename, description, move, delete. */
export function GroupDetail({
  group,
  issues,
  onChangeDescription,
  onRename,
  onDelete,
  onMove,
  onClose,
  onOpenPath,
  onChangeDeprecated,
  onChangeType,
}: GroupDetailProps) {
  const tokens = countTokens(group)
  return (
    <div style={{ padding: "14px 20px 24px" }}>
      <NodeHeader
        name={group.name}
        path={group.path}
        badge={
          <>
            <DeprecatedPill value={group.deprecated} />
            <span className="pill" style={{ opacity: 0.7 }}>
              group
            </span>
          </>
        }
        below={
          <TypeSelect
            value={group.type}
            inherited={group.inheritedType}
            onChange={onChangeType}
          />
        }
        summary={`${tokens} ${tokens === 1 ? "token" : "tokens"}`}
        onOpenPath={onOpenPath}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
        onClose={onClose}
      />

      <Problems issues={issues} />

      {(group.type ?? group.inheritedType) && (
        <Section label="Contents">
          <span style={{ opacity: 0.8 }}>
            <code>$type {group.type ?? group.inheritedType}</code>
            {group.type
              ? " applies to every descendant without its own"
              : " inherited from an ancestor"}
          </span>
        </Section>
      )}

      <Section label="Description">
        <TextInput
          key={group.path.join(".")}
          value={group.description ?? ""}
          placeholder="Optional $description"
          onCommit={onChangeDescription}
        />
      </Section>

      <DeprecatedField value={group.deprecated} onChange={onChangeDeprecated} />
    </div>
  )
}
