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
 * NO DnD-Reparenting in 70-β (that's 70-δ). Tree-View is read-only
 * w.r.t. hierarchy; only Title/Kind/Description are editable.
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

const ALLOWED_KINDS_BY_METHOD: Record<string, ReadonlySet<string>> = {
  waterfall: new Set(["phase", "work_package", "todo"]),
  Wasserfall: new Set(["phase", "work_package", "todo"]),
  scrum: new Set(["epic", "story", "task", "subtask", "bug"]),
  Scrum: new Set(["epic", "story", "task", "subtask", "bug"]),
  agile: new Set(["epic", "story", "task", "subtask", "bug"]),
  Agile: new Set(["epic", "story", "task", "subtask", "bug"]),
  kanban: new Set(["epic", "story", "task", "subtask", "bug"]),
}

/** Returns true when the kind is compatible with the project method. */
function isKindCompatible(kind: string, projectMethod: string | null): boolean {
  if (!projectMethod) return true
  const allowed = ALLOWED_KINDS_BY_METHOD[projectMethod]
  if (!allowed) return true // hybrid + unknown methods accept all kinds
  return allowed.has(kind)
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
  // PROJ-70-γ: file-picker state. The picker accepts PDF/DOCX/TXT/MD;
  // server-side magic-byte sniffing is the security boundary, the
  // accept-attribute is just a UX hint.
  const [pickedFile, setPickedFile] = React.useState<File | null>(null)
  const [titleInput, setTitleInput] = React.useState("")
  const [editingTempId, setEditingTempId] = React.useState<string | null>(null)

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
      toast.error("Bitte zuerst eine Datei auswählen (PDF / DOCX / TXT / MD)")
      return
    }
    const inferredTitle = titleInput.trim() || pickedFile.name
    setBusy(true)
    try {
      // PROJ-70-γ: upload file (multipart) → context_sources row → trigger
      // proposal_from_context with the returned id.
      const inferredKind: string =
        pickedFile.type === "application/pdf" ||
        pickedFile.name.toLowerCase().endsWith(".pdf")
          ? "document"
          : pickedFile.type ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            pickedFile.name.toLowerCase().endsWith(".docx")
            ? "document"
            : pickedFile.name.toLowerCase().endsWith(".md")
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
  }, [pickedFile, titleInput, projectId, reload])

  const onAcceptOne = React.useCallback(
    async (suggestion: ProposalFromContextSuggestionRow) => {
      setBusy(true)
      try {
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
    [projectId, reload, showUndoToast],
  )

  const onAcceptAll = React.useCallback(async () => {
    if (drafts.length === 0) return
    setBusy(true)
    try {
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
  }, [drafts, projectId, reload, showUndoToast])

  const onRejectOne = React.useCallback(
    async (suggestion: ProposalFromContextSuggestionRow) => {
      setBusy(true)
      try {
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
    [reload],
  )

  const onRejectAll = React.useCallback(async () => {
    if (drafts.length === 0) return
    setBusy(true)
    try {
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
  }, [drafts, reload])

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
            Kickoff-Datei (PDF · DOCX · TXT · MD · max 25 MB)
          </label>
          <input
            id="backlog-proposal-file-input"
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
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
          Noch keine Vorschläge. Gib oben eine Context-Source-ID ein und
          klicke „Generieren&ldquo;.
        </div>
      )}

      {treeData.length > 0 && (
        <div className="overflow-hidden rounded-md border bg-card">
          <Tree<BacklogProposalTreeNodeData>
            data={treeData}
            openByDefault
            rowHeight={56}
            indent={20}
            width="100%"
            height={Math.min(480, Math.max(160, treeData.length * 80))}
            disableDrag
            disableDrop
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
