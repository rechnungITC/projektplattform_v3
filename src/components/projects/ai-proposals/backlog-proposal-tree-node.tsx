"use client"

/**
 * PROJ-70-β — Single row in the BacklogProposalTab tree.
 *
 * Inline-edit reaches title + kind + description. Confidence-Badge +
 * Method-Compatibility-Warning rendered next to the title.
 * Accept/Reject buttons stay visible at the row's right edge.
 *
 * PROJ-70-δ additions:
 *   - `dropDisabled` (Lock Q4, analog PROJ-59): while a drag is active
 *     and this row is NOT a valid drop-target it renders a red outline +
 *     `aria-disabled` + `cursor-not-allowed`. No toast.
 *   - Keyboard reparenting (AC-δ7): the row is focusable; `Tab` indents
 *     (child of previous sibling), `Shift+Tab` outdents (sibling of the
 *     current parent). Handlers come from the tab; validation lives in
 *     `proposal-tree-rules.ts`.
 *   - `data-temp-id` lets the tab's dragstart-capture resolve which
 *     suggestion is being dragged (drives the cue).
 */

import * as React from "react"
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Component,
  FileText,
  GitBranch,
  Package,
  Pencil,
  Target,
  X,
  XCircle,
} from "lucide-react"
import { type NodeApi } from "react-arborist"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  type ProposalFromContextKind,
  type ProposalFromContextSuggestionPayload,
  type ProposalFromContextSuggestionRow,
} from "@/lib/ai-proposals/proposal-from-context-api"

export interface BacklogProposalTreeNodeData {
  id: string
  suggestion: ProposalFromContextSuggestionRow
  children: BacklogProposalTreeNodeData[]
}

const KIND_VISUAL: Record<
  ProposalFromContextKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  work_package: {
    label: "Work-Package",
    icon: Package,
    cls: "text-sky-600 dark:text-sky-300",
  },
  epic: { label: "Epic", icon: Target, cls: "text-violet-600 dark:text-violet-300" },
  story: { label: "Story", icon: GitBranch, cls: "text-emerald-600 dark:text-emerald-300" },
  task: { label: "Task", icon: Component, cls: "text-cyan-600 dark:text-cyan-300" },
  subtask: { label: "Subtask", icon: FileText, cls: "text-amber-600 dark:text-amber-300" },
  bug: { label: "Bug", icon: Bug, cls: "text-rose-600 dark:text-rose-300" },
}

const KIND_OPTIONS: ProposalFromContextKind[] = [
  "work_package",
  "epic",
  "story",
  "task",
  "subtask",
  "bug",
]

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
}

const CONFIDENCE_CLS: Record<"low" | "medium" | "high", string> = {
  low: "border-slate-300/40 text-slate-600 dark:text-slate-300",
  medium: "border-amber-300/40 text-amber-700 dark:text-amber-300",
  high: "border-emerald-300/40 text-emerald-700 dark:text-emerald-300",
}

interface BacklogProposalTreeNodeProps {
  style?: React.CSSProperties
  node: NodeApi<BacklogProposalTreeNodeData>
  isEditing: boolean
  busy: boolean
  isCompatible: boolean
  /** PROJ-70-δ Lock Q4 — true while a drag is active and this row is
   *  NOT a valid drop-target for the dragged suggestion. */
  dropDisabled: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (patch: Partial<ProposalFromContextSuggestionPayload>) => void
  onAccept: () => void
  onReject: () => void
  /** PROJ-70-δ AC-δ7 — Tab on the focused row. */
  onIndent: () => void
  /** PROJ-70-δ AC-δ7 — Shift+Tab on the focused row. */
  onOutdent: () => void
}

export function BacklogProposalTreeNode({
  style,
  node,
  isEditing,
  busy,
  isCompatible,
  dropDisabled,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onAccept,
  onReject,
  onIndent,
  onOutdent,
}: BacklogProposalTreeNodeProps) {
  const suggestion = node.data.suggestion
  const payload = suggestion.payload
  const visual = KIND_VISUAL[payload.kind]
  const Icon = visual.icon
  const hasChildren = node.children !== null && node.children.length > 0
  const [descExpanded, setDescExpanded] = React.useState(false)

  const onClickRow = (event: React.MouseEvent) => {
    // Only toggle expand when the click happens directly on the row,
    // not on a button/input inside it.
    if ((event.target as HTMLElement).closest("button,input,textarea,select"))
      return
    if (hasChildren) node.toggle()
    else setDescExpanded((v) => !v)
  }

  // AC-δ7 — keyboard reparenting on the focused row. Tab/Shift+Tab are
  // captured ONLY when the row itself has focus (not its buttons/inputs)
  // so normal focus-traversal inside the row keeps working.
  const onKeyDownRow = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return
    if (event.target !== event.currentTarget) return
    if (isEditing || busy) return
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) onOutdent()
    else onIndent()
  }

  return (
    <div
      style={style}
      tabIndex={0}
      onKeyDown={onKeyDownRow}
      data-temp-id={payload.temp_id}
      aria-disabled={dropDisabled || undefined}
      className={`group flex items-start gap-2 border-b border-border/40 px-2 py-1.5 text-sm hover:bg-muted/30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring ${
        dropDisabled
          ? "cursor-not-allowed opacity-60 outline outline-1 outline-destructive/70"
          : ""
      }`}
      data-testid="backlog-proposal-tree-node"
      data-drop-disabled={dropDisabled || undefined}
    >
      <button
        type="button"
        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
        onClick={() => (hasChildren ? node.toggle() : undefined)}
        disabled={!hasChildren}
        aria-label={hasChildren ? (node.isOpen ? "Einklappen" : "Aufklappen") : "Blatt"}
      >
        {hasChildren ? (
          node.isOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )
        ) : (
          <span className="block h-4 w-4" />
        )}
      </button>

      <Icon
        className={`mt-1 h-4 w-4 shrink-0 ${visual.cls}`}
        aria-hidden
      />

      <div className="min-w-0 flex-1" onClick={onClickRow}>
        {/* Title row — inline editor or display */}
        {isEditing ? (
          <InlineEditor
            initialTitle={payload.title}
            initialKind={payload.kind}
            initialDescription={payload.description}
            busy={busy}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium">{payload.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {visual.label}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] ${CONFIDENCE_CLS[payload.confidence]}`}
              >
                {CONFIDENCE_LABEL[payload.confidence]}
              </Badge>
              {!isCompatible && (
                <Badge
                  variant="outline"
                  className="border-amber-400/40 text-[10px] text-amber-800 dark:text-amber-200"
                >
                  <AlertTriangle className="mr-0.5 h-3 w-3" aria-hidden />
                  Method-Mismatch
                </Badge>
              )}
              {payload.relevance === "off_goal" && (
                <Badge
                  variant="outline"
                  className="border-rose-400/40 text-[10px] text-rose-700 dark:text-rose-300"
                  title="Stammt aus dem Dokument, passt aber nicht zum Projektziel (Vorhaben)."
                >
                  <AlertTriangle className="mr-0.5 h-3 w-3" aria-hidden />
                  ≠ Ziel
                </Badge>
              )}
            </div>
            {payload.description && (
              <p
                className={`mt-0.5 cursor-pointer text-[11px] text-muted-foreground ${descExpanded ? "" : "line-clamp-1"}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setDescExpanded((v) => !v)
                }}
              >
                {payload.description}
              </p>
            )}
          </>
        )}
      </div>

      {/* Row-level action buttons (visible only when NOT editing) */}
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onStartEdit}
            disabled={busy}
            aria-label="Bearbeiten"
            title="Bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={onReject}
            disabled={busy}
            aria-label="Ablehnen"
            title="Ablehnen"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-emerald-600 dark:text-emerald-300"
            onClick={onAccept}
            disabled={busy}
            aria-label="Annehmen"
            title="Annehmen"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineEditor — sub-component mounted only when isEditing=true.
// Its useState initializers run once on mount, so we don't need a useEffect
// to reset draft fields when re-entering edit-mode (the parent unmounts the
// editor on exit, and a fresh mount initialises drafts from the passed
// props). This avoids the `react-hooks/set-state-in-effect` lint rule that
// React Compiler enforces.
// ---------------------------------------------------------------------------

interface InlineEditorProps {
  initialTitle: string
  initialKind: ProposalFromContextKind
  initialDescription: string | null
  busy: boolean
  onSave: (patch: Partial<ProposalFromContextSuggestionPayload>) => void
  onCancel: () => void
}

function InlineEditor({
  initialTitle,
  initialKind,
  initialDescription,
  busy,
  onSave,
  onCancel,
}: InlineEditorProps) {
  const [draftTitle, setDraftTitle] = React.useState(initialTitle)
  const [draftKind, setDraftKind] =
    React.useState<ProposalFromContextKind>(initialKind)
  const [draftDescription, setDraftDescription] = React.useState(
    initialDescription ?? "",
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Titel"
          autoFocus
        />
        <Select
          value={draftKind}
          onValueChange={(v) => setDraftKind(v as ProposalFromContextKind)}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {KIND_VISUAL[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={busy || draftTitle.trim().length < 3}
          onClick={() =>
            onSave({
              title: draftTitle.trim(),
              kind: draftKind,
              description:
                draftDescription.trim() === "" ? null : draftDescription.trim(),
            })
          }
          aria-label="Speichern"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onCancel}
          disabled={busy}
          aria-label="Abbrechen"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <Textarea
        value={draftDescription}
        onChange={(e) => setDraftDescription(e.target.value)}
        placeholder="Beschreibung (optional, max 500 Zeichen)"
        maxLength={500}
        rows={2}
        className="min-h-0 resize-none text-xs"
      />
    </div>
  )
}
