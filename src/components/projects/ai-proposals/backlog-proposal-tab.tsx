"use client"

/**
 * PROJ-70-β — Backlog-Proposal tab inside AIProposalDrawer.
 *
 * Renders a hierarchical tree of AI-generated backlog proposals derived
 * from a Kickoff-Artefakt (context_source). User actions:
 *   - Generate (POST → router → suggestions persisted)
 *   - Accept single (Bulk-RPC with N=1)
 *   - Accept all visible drafts (Bulk-RPC with the whole draft set)
 *   - Reject single (purpose-agnostic /api/ki/suggestions/[id]/reject)
 *   - Inline-edit title + kind (PATCH /api/ki/suggestions/[id])
 *   - Undo within 30 s after any bulk-accept (sonner Toast action)
 *
 * PROJ-70-δ adds DnD-Reparenting (AC-δ4..δ7):
 *   - react-arborist native DnD (Lock Q3 — no @dnd-kit for the tree):
 *     `onMove` flips `parent_temp_id` in LOCAL state only; persistence
 *     happens lazily via the β-PATCH route right before accept
 *     ("flush-dirty-parents"), then the bulk-RPC topological-sort takes
 *     over. Zero backend change.
 *   - Validation gates per drop: `checkReparent` = structural
 *     PROPOSAL_ALLOWED_PARENT_KINDS (AC-δ5) + method matrix (AC-δ6) +
 *     self/descendant-cycle guards.
 *   - Drop-disabled cue (Lock Q4, analog PROJ-59): invalid targets get
 *     red outline + aria-disabled + cursor-not-allowed while dragging —
 *     no toast.
 *   - Keyboard: Tab indents (child of previous sibling), Shift+Tab
 *     outdents (sibling of current parent) on the focused row (AC-δ7),
 *     with aria-live announcements.
 *
 * Method-validation per AC-β7: when project_method imposes a kind
 * matrix (waterfall/scrum/kanban), rows with incompatible kind get a
 * warning-badge. Bulk-accept includes those rows by default unless the
 * user fixes the kind first; the RPC enforces strict=true and will
 * reject the whole batch with an actionable error.
 */

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { type NodeApi, Tree } from "react-arborist"

import { Button } from "@/components/ui/button"
import {
  acceptProposalFromContext,
  editProposalFromContextSuggestion,
  listProposalFromContextSuggestions,
  rejectProposalFromContextSuggestion,
  triggerProposalFromContext,
  undoProposalFromContextAccept,
  uploadContextSourceFile,
  type ProposalFromContextSuggestionPayload,
  type ProposalFromContextSuggestionRow,
} from "@/lib/ai-proposals/proposal-from-context-api"
import {
  applyReparent,
  checkReparent,
  isProposalKindCompatibleWithMethod,
  type ReparentRejection,
} from "@/lib/ai-proposals/proposal-tree-rules"

import {
  BacklogProposalTreeNode,
  type BacklogProposalTreeNodeData,
} from "./backlog-proposal-tree-node"

interface BacklogProposalTabProps {
  projectId: string
  /** Project method drives the kind-validation badge.
   *  Pass null when unknown — all kinds will then be considered valid. */
  projectMethod: string | null
}

/** Helper: build a flat tree-node array suitable for react-arborist from a
 *  flat suggestion list with `temp_id`/`parent_temp_id`. react-arborist
 *  reads `id` + `children?` to build hierarchy; we precompute children
 *  here. */
function buildTree(
  rows: ProposalFromContextSuggestionRow[],
): BacklogProposalTreeNodeData[] {
  // Only consider draft rows in the tree view. Accepted/rejected rows
  // are shown separately below the tree.
  const drafts = rows.filter((r) => r.status === "draft")
  const byTempId = new Map<string, BacklogProposalTreeNodeData>()
  drafts.forEach((row) => {
    byTempId.set(row.payload.temp_id, {
      id: row.payload.temp_id,
      suggestion: row,
      children: [],
    })
  })
  const roots: BacklogProposalTreeNodeData[] = []
  drafts.forEach((row) => {
    const node = byTempId.get(row.payload.temp_id)
    if (!node) return
    const parentTemp = row.payload.parent_temp_id
    if (parentTemp && byTempId.has(parentTemp)) {
      byTempId.get(parentTemp)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

// Method-compatibility moved to `proposal-tree-rules.ts` in 70-δ so the
// DnD gates and the badge share one matrix.
const isKindCompatible = isProposalKindCompatibleWithMethod

/** Human-readable aria-live feedback per rejection reason (AC-δ7 —
 *  keyboard users get announcements instead of the visual drop-cue). */
const REJECT_MESSAGE: Record<ReparentRejection, string> = {
  self_drop: "Ein Element kann nicht sein eigenes Eltern-Element sein.",
  descendant_cycle:
    "Verschieben abgelehnt: Ziel liegt innerhalb des eigenen Teilbaums.",
  kind_not_allowed:
    "Verschieben abgelehnt: Diese Art darf dort nicht eingeordnet werden.",
  method_incompatible:
    "Verschieben abgelehnt: Kombination passt nicht zur Projekt-Methode.",
  unknown_node: "Verschieben abgelehnt: Element nicht gefunden.",
}

export function BacklogProposalTab({
  projectId,
  projectMethod,
}: BacklogProposalTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    ProposalFromContextSuggestionRow[]
  >([])
  const [busy, setBusy] = React.useState(false)
  // PROJ-70-γ+δ: file-picker state. The picker accepts PDF/DOCX/TXT/MD/EML/MSG;
  // server-side magic-byte sniffing is the security boundary, the
  // accept-attribute is just a UX hint.
  const [pickedFile, setPickedFile] = React.useState<File | null>(null)
  const [titleInput, setTitleInput] = React.useState("")
  const [editingTempId, setEditingTempId] = React.useState<string | null>(null)
  // PROJ-70-δ — DnD state. `dirtyTempIds` tracks rows whose
  // parent_temp_id changed locally but is not yet PATCHed (flushed right
  // before accept). `dragTempId` drives the drop-disabled cue.
  const [dirtyTempIds, setDirtyTempIds] = React.useState<ReadonlySet<string>>(
    new Set(),
  )
  const [dragTempId, setDragTempId] = React.useState<string | null>(null)
  const [liveMessage, setLiveMessage] = React.useState("")

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listProposalFromContextSuggestions(projectId)
      setSuggestions(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch when the tab opens
    void reload()
  }, [reload])

  const drafts = React.useMemo(
    () => suggestions.filter((s) => s.status === "draft"),
    [suggestions],
  )
  const others = React.useMemo(
    () => suggestions.filter((s) => s.status !== "draft"),
    [suggestions],
  )
  const treeData = React.useMemo(() => buildTree(suggestions), [suggestions])

  const incompatibleCount = React.useMemo(
    () =>
      drafts.filter((s) => !isKindCompatible(s.payload.kind, projectMethod))
        .length,
    [drafts, projectMethod],
  )

  // ---- PROJ-70-δ: DnD-reparenting -----------------------------------
  // (defined BEFORE the action handlers — they list flushDirtyParents
  // in their dependency arrays.)

  /** Shared by drag-drop AND keyboard indent/outdent: validate via
   *  checkReparent, mutate local state via applyReparent, remember the
   *  row as dirty for the pre-accept flush. */
  const requestReparent = React.useCallback(
    (tempId: string, newParentTempId: string | null) => {
      setSuggestions((prev) => {
        const result = applyReparent(prev, tempId, newParentTempId, projectMethod)
        if (!result.check.allowed && result.check.reason) {
          setLiveMessage(REJECT_MESSAGE[result.check.reason])
          return prev
        }
        if (result.changed) {
          setDirtyTempIds((d) => new Set(d).add(tempId))
          const moved = result.rows.find((r) => r.payload.temp_id === tempId)
          const parent = newParentTempId
            ? result.rows.find((r) => r.payload.temp_id === newParentTempId)
            : null
          setLiveMessage(
            parent
              ? `„${moved?.payload.title}" ist jetzt unter „${parent.payload.title}" eingeordnet.`
              : `„${moved?.payload.title}" ist jetzt auf oberster Ebene.`,
          )
        }
        return result.rows
      })
    },
    [projectMethod],
  )

  /** Persist locally-changed parent_temp_ids via the β-PATCH route.
   *  Called right before accept (the bulk-RPC reads payloads from the
   *  DB) and before reject/generate (which reload from the server and
   *  would otherwise drop unsaved tree edits). */
  const flushDirtyParents = React.useCallback(async () => {
    if (dirtyTempIds.size === 0) return
    const dirtyRows = suggestions.filter(
      (s) => s.status === "draft" && dirtyTempIds.has(s.payload.temp_id),
    )
    await Promise.all(
      dirtyRows.map((s) => editProposalFromContextSuggestion(s.id, s.payload)),
    )
    setDirtyTempIds(new Set())
  }, [dirtyTempIds, suggestions])

  /** AC-δ7 — Tab on a focused row: become child of the previous sibling. */
  const onIndent = React.useCallback(
    (node: NodeApi<BacklogProposalTreeNodeData>) => {
      const prevSibling = node.parent?.children?.[node.childIndex - 1]
      if (!prevSibling) {
        setLiveMessage(
          "Einrücken nicht möglich: kein vorheriges Geschwister-Element.",
        )
        return
      }
      requestReparent(
        node.data.suggestion.payload.temp_id,
        prevSibling.data.suggestion.payload.temp_id,
      )
    },
    [requestReparent],
  )

  /** AC-δ7 — Shift+Tab: become sibling of the current parent. */
  const onOutdent = React.useCallback(
    (node: NodeApi<BacklogProposalTreeNodeData>) => {
      const parent = node.parent
      if (!parent || parent.isRoot) {
        setLiveMessage("Ausrücken nicht möglich: bereits auf oberster Ebene.")
        return
      }
      const grandparent = parent.parent
      requestReparent(
        node.data.suggestion.payload.temp_id,
        grandparent && !grandparent.isRoot
          ? grandparent.data.suggestion.payload.temp_id
          : null,
      )
    },
    [requestReparent],
  )

  /** Lock Q4 — drop-target validity for the cue + react-arborist's own
   *  disableDrop gate. parentTempId null = top-level drop. */
  const isValidDropTarget = React.useCallback(
    (dragId: string, parentTempId: string | null) =>
      checkReparent(suggestions, dragId, parentTempId, projectMethod).allowed,
    [suggestions, projectMethod],
  )

  // ---- actions ------------------------------------------------------

  const showUndoToast = React.useCallback(
    (acceptedIds: string[], createdWorkItemCount: number) => {
      const label =
        acceptedIds.length === 1
          ? "1 Vorschlag akzeptiert"
          : `${acceptedIds.length} Vorschläge akzeptiert`
      toast.success(`${label} (${createdWorkItemCount} Work-Items angelegt)`, {
        duration: 30_000,
        action: {
          label: "Rückgängig",
          onClick: () => {
            void (async () => {
              try {
                await undoProposalFromContextAccept(projectId, acceptedIds)
                toast.success("Akzeptanz rückgängig gemacht")
                await reload()
              } catch (err) {
                toast.error("Rückgängig fehlgeschlagen", {
                  description:
                    err instanceof Error ? err.message : "Unbekannter Fehler",
                })
              }
            })()
          },
        },
      })
    },
    [projectId, reload],
  )

  const onGenerate = React.useCallback(async () => {
    if (!pickedFile) {
      toast.error(
        "Bitte zuerst eine Datei auswählen (PDF / DOCX / TXT / MD / EML / MSG)",
      )
      return
    }
    const inferredTitle = titleInput.trim() || pickedFile.name
    setBusy(true)
    try {
      // PROJ-70-δ — a new generation reloads; keep pending tree edits.
      await flushDirtyParents()
      // PROJ-70-γ: upload file (multipart) → context_sources row → trigger
      // proposal_from_context with the returned id.
      const lowerName = pickedFile.name.toLowerCase()
      const inferredKind: string =
        pickedFile.type === "application/pdf" ||
        lowerName.endsWith(".pdf")
          ? "document"
          : pickedFile.type ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            lowerName.endsWith(".docx")
            ? "document"
            : // PROJ-70-δ — kickoff emails land as kind "email".
              lowerName.endsWith(".eml") || lowerName.endsWith(".msg")
              ? "email"
              : lowerName.endsWith(".md")
                ? "meeting_notes"
                : "other"

      const contextSource = await uploadContextSourceFile({
        file: pickedFile,
        kind: inferredKind,
        title: inferredTitle,
        projectId,
      })

      const result = await triggerProposalFromContext(projectId, {
        contextSourceId: contextSource.id,
        count: 10,
      })

      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        toast.info("Lokal ausgeführt", {
          description:
            result.error_message ??
            "Cloud-Routing nicht möglich; lokales Fallback genutzt.",
        })
      } else {
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keine Vorschläge generiert — Kontext zu dünn."
            : `${result.suggestion_ids.length} neue${result.suggestion_ids.length === 1 ? "r" : ""} Vorschlag${result.suggestion_ids.length === 1 ? "" : "e"}`,
        )
        // Reset the picker on a successful run so the user doesn't
        // re-upload by accident.
        setPickedFile(null)
        setTitleInput("")
      }
      await reload()
    } catch (err) {
      toast.error("Upload oder Generierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }, [pickedFile, titleInput, projectId, reload, flushDirtyParents])

  const onAcceptOne = React.useCallback(
    async (suggestion: ProposalFromContextSuggestionRow) => {
      setBusy(true)
      try {
        // PROJ-70-δ — persist pending DnD parent-changes first; the RPC
        // reads payloads from the DB, not from local state.
        await flushDirtyParents()
        const result = await acceptProposalFromContext(
          projectId,
          [suggestion.id],
        )
        showUndoToast(
          result.accepted_suggestion_ids,
          result.created_work_item_ids.length,
        )
        await reload()
      } catch (err) {
        toast.error("Akzeptieren fehlgeschlagen", {
          description:
            err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setBusy(false)
      }
    },
    [projectId, reload, showUndoToast, flushDirtyParents],
  )

  const onAcceptAll = React.useCallback(async () => {
    if (drafts.length === 0) return
    setBusy(true)
    try {
      // PROJ-70-δ — flush DnD parent-changes before the bulk-RPC.
      await flushDirtyParents()
      const ids = drafts.map((d) => d.id)
      const result = await acceptProposalFromContext(projectId, ids)
      showUndoToast(
        result.accepted_suggestion_ids,
        result.created_work_item_ids.length,
      )
      await reload()
    } catch (err) {
      toast.error("Bulk-Accept fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }, [drafts, projectId, reload, showUndoToast, flushDirtyParents])

  const onRejectOne = React.useCallback(
    async (suggestion: ProposalFromContextSuggestionRow) => {
      setBusy(true)
      try {
        // Reject reloads from the server — flush so tree edits survive.
        await flushDirtyParents()
        await rejectProposalFromContextSuggestion(suggestion.id)
        toast.success("Vorschlag abgelehnt")
        await reload()
      } catch (err) {
        toast.error("Ablehnen fehlgeschlagen", {
          description:
            err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setBusy(false)
      }
    },
    [reload, flushDirtyParents],
  )

  const onRejectAll = React.useCallback(async () => {
    if (drafts.length === 0) return
    setBusy(true)
    try {
      await flushDirtyParents()
      await Promise.all(
        drafts.map((s) => rejectProposalFromContextSuggestion(s.id)),
      )
      toast.success(
        drafts.length === 1
          ? "1 Vorschlag abgelehnt"
          : `${drafts.length} Vorschläge abgelehnt`,
      )
      await reload()
    } catch (err) {
      toast.error("Bulk-Reject fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }, [drafts, reload, flushDirtyParents])

  const onEdit = React.useCallback(
    async (
      suggestion: ProposalFromContextSuggestionRow,
      patch: Partial<ProposalFromContextSuggestionPayload>,
    ) => {
      setBusy(true)
      try {
        await editProposalFromContextSuggestion(suggestion.id, {
          ...suggestion.payload,
          ...patch,
        })
        toast.success("Vorschlag aktualisiert")
        setEditingTempId(null)
        await reload()
      } catch (err) {
        toast.error("Bearbeiten fehlgeschlagen", {
          description:
            err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  // ---- render -------------------------------------------------------

  return (
    <div className="space-y-3" data-testid="backlog-proposal-tab">
      <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/10 p-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="backlog-proposal-file-input"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Kickoff-Datei (PDF · DOCX · TXT · MD · EML · MSG · max 25 MB)
          </label>
          <input
            id="backlog-proposal-file-input"
            type="file"
            accept=".pdf,.docx,.txt,.md,.eml,.msg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,message/rfc822,application/vnd.ms-outlook"
            className="h-8 w-full text-sm file:mr-2 file:rounded file:border file:border-input file:bg-background file:px-2 file:py-0.5 file:text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              setPickedFile(file)
              if (file && !titleInput) setTitleInput(file.name)
            }}
            disabled={busy}
            data-testid="backlog-proposal-file-input"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="backlog-proposal-title-input"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Titel (optional — Dateiname als Default)
            </label>
            <input
              id="backlog-proposal-title-input"
              type="text"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              placeholder="z.B. Kickoff-Protokoll 2026-06-04"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void onGenerate()}
            disabled={busy || !pickedFile}
            data-testid="backlog-proposal-generate"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {busy ? "Lädt …" : "Hochladen + Generieren"}
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
        KI schlägt eine hierarchische Backlog-Struktur aus einem Kickoff-Dokument
        vor. Du reviewst jeden Vorschlag, editierst inline und akzeptierst
        einzeln oder bulk. Innerhalb von 30&nbsp;s kannst du die Akzeptanz
        wieder rückgängig machen.
      </p>

      {incompatibleCount > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {incompatibleCount}{" "}
            {incompatibleCount === 1
              ? "Vorschlag hat"
              : "Vorschläge haben"}{" "}
            ein Kind, das nicht zur Projekt-Methode passt. Vor Bulk-Accept
            inline editieren — sonst lehnt der Server die ganze Batch ab.
          </span>
        </p>
      )}

      {/* BulkActionBar */}
      {drafts.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {drafts.length} offen · {others.length} bearbeitet
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void onRejectAll()}
              disabled={busy || drafts.length === 0}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Alle ablehnen
            </Button>
            <Button
              size="sm"
              onClick={() => void onAcceptAll()}
              disabled={busy || drafts.length === 0}
              data-testid="backlog-proposal-accept-all"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Alle akzeptieren ({drafts.length})
            </Button>
          </div>
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Lade Vorschläge …</p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          Noch keine Vorschläge. Lade oben eine Kickoff-Datei hoch und
          klicke „Hochladen + Generieren&ldquo;.
        </div>
      )}

      {/* AC-δ7 a11y — announces reparent results + rejections for
          keyboard users (the visual drop-cue is mouse-only). */}
      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>

      {treeData.length > 0 && (
        <div
          className="overflow-hidden rounded-md border bg-card"
          data-testid="backlog-proposal-tree"
          // PROJ-70-δ — HTML5-DnD events bubble up from react-arborist's
          // draggable rows; capture them here to drive the
          // drop-disabled cue (Lock Q4) without forking the Tree.
          onDragStartCapture={(e) => {
            const row = (e.target as HTMLElement).closest("[data-temp-id]")
            if (row) setDragTempId(row.getAttribute("data-temp-id"))
          }}
          onDragEndCapture={() => setDragTempId(null)}
          onDropCapture={() => setDragTempId(null)}
        >
          <Tree<BacklogProposalTreeNodeData>
            data={treeData}
            openByDefault
            rowHeight={56}
            indent={20}
            width="100%"
            height={Math.min(480, Math.max(160, treeData.length * 80))}
            // PROJ-70-δ — native react-arborist DnD (Lock Q3).
            disableDrag={busy || editingTempId !== null}
            disableDrop={({ parentNode, dragNodes }) => {
              const parentTempId =
                !parentNode || parentNode.isRoot
                  ? null
                  : parentNode.data.suggestion.payload.temp_id
              return !dragNodes.every((dn) =>
                isValidDropTarget(
                  dn.data.suggestion.payload.temp_id,
                  parentTempId,
                ),
              )
            }}
            onMove={({ dragIds, parentId }) => {
              // parentId is the drop-target's node id (= temp_id);
              // null = tree root. Multi-selection is disabled → 1 id.
              for (const dragId of dragIds) {
                requestReparent(dragId, parentId)
              }
            }}
            disableEdit
            disableMultiSelection
          >
            {(props) => {
              const node = props.node as NodeApi<BacklogProposalTreeNodeData>
              return (
                <BacklogProposalTreeNode
                  style={props.style}
                  node={node}
                  isEditing={
                    editingTempId === node.data.suggestion.payload.temp_id
                  }
                  onStartEdit={() =>
                    setEditingTempId(node.data.suggestion.payload.temp_id)
                  }
                  onCancelEdit={() => setEditingTempId(null)}
                  onSaveEdit={(patch) =>
                    onEdit(node.data.suggestion, patch)
                  }
                  onAccept={() => onAcceptOne(node.data.suggestion)}
                  onReject={() => onRejectOne(node.data.suggestion)}
                  busy={busy}
                  isCompatible={isKindCompatible(
                    node.data.suggestion.payload.kind,
                    projectMethod,
                  )}
                  // PROJ-70-δ — drop-disabled cue + keyboard reparenting.
                  dropDisabled={
                    dragTempId !== null &&
                    dragTempId !== node.data.suggestion.payload.temp_id &&
                    !isValidDropTarget(
                      dragTempId,
                      node.data.suggestion.payload.temp_id,
                    )
                  }
                  onIndent={() => onIndent(node)}
                  onOutdent={() => onOutdent(node)}
                />
              )
            }}
          </Tree>
        </div>
      )}

      {others.length > 0 && (
        <section className="space-y-1 pt-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bearbeitet
          </h3>
          <ul className="space-y-1 text-xs">
            {others.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/10 px-2 py-1"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {s.status === "accepted" ? (
                    <CheckCircle2
                      className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-300"
                      aria-hidden
                    />
                  ) : (
                    <XCircle
                      className="h-3 w-3 shrink-0 text-destructive"
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{s.payload.title}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
          {others.some((s) => s.status === "accepted") && (
            <p className="text-[10px] text-muted-foreground">
              <RotateCcw className="mr-0.5 inline h-3 w-3" aria-hidden /> Tipp:
              Akzeptierte Vorschläge sind 30 s rückgängig — der Undo-Link
              erscheint direkt nach dem Accept im Toast.
            </p>
          )}
        </section>
      )}

      {/* Reserve a "Pencil" icon import use so the tree can stay self-
          contained when no rows are present. */}
      <Pencil className="hidden h-0 w-0" aria-hidden />
    </div>
  )
}
