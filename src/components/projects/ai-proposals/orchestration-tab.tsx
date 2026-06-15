"use client"

/**
 * PROJ-90 — "Projekt befüllen" conductor tab inside AIProposalDrawer.
 *
 * The epic-bracket conductor over the three deployed kickoff-derived
 * modules (PROJ-70 Backlog, PROJ-88 Stakeholder, PROJ-89 Risiken). It
 * does NOT re-implement card rendering — the three per-module tabs stay
 * for detail review/edit. This tab orchestrates:
 *   - ONE shared kickoff source (existing context_source OR fresh upload)
 *     fed to all three purposes.
 *   - "Alles generieren" → SEQUENTIAL Generate-All with a 3-row progress
 *     list; each module is isolated (a blocked/errored module sets its own
 *     row and the loop continues — AC-90.7). Cost-cap is enforced
 *     server-side; we only surface the result.
 *   - "Alles akzeptieren" (global) + per-module accept; the global path
 *     fans out over the three existing bulk-accept RPCs and shows ONE
 *     30s-undo toast that fans out over the three undo RPCs (AC-90.3,
 *     user-locked fork: client-side fan-out, best-effort per module).
 *
 * Class-3 routing is unchanged (AC-90.6): Stakeholder generation is
 * Class-3-pinned → "blockiert" if no Ollama, while Backlog + Risiken
 * (content-classified → cloud-capable) still generate.
 *
 * No new backend: this composes the three deployed `…-proposals-api`
 * client wrappers. Orchestration state is ephemeral React state.
 */

import * as React from "react"
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  ServerOff,
  Sparkles,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
  acceptProposalFromContext,
  listProposalFromContextSuggestions,
  triggerProposalFromContext,
  undoProposalFromContextAccept,
  uploadContextSourceFile,
} from "@/lib/ai-proposals/proposal-from-context-api"
import {
  acceptStakeholderProposals,
  listStakeholderProposalSuggestions,
  triggerStakeholderProposals,
  undoStakeholderProposalsAccept,
} from "@/lib/ai-proposals/stakeholder-proposals-api"
import {
  acceptRiskProposals,
  listRiskProposalSuggestions,
  triggerRiskProposals,
  undoRiskProposalsAccept,
} from "@/lib/ai-proposals/risk-proposals-api"

interface OrchestrationTabProps {
  projectId: string
  /** When set (wizard `?aiDrawer=fill` deep-link), Generate-All auto-runs
   *  once on mount for this shared context source. */
  autoGenerateContextSourceId?: string | null
}

interface ContextSourceOption {
  id: string
  title: string
  kind: string
  created_at: string
}

type ModuleKey = "backlog" | "stakeholders" | "risks"

type RowStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; count: number }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; reason: string }

interface ModuleState {
  /** Current draft suggestion ids (refreshed before any accept). */
  draftIds: string[]
  status: RowStatus
}

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "stakeholders", label: "Stakeholder" },
  { key: "risks", label: "Risiken" },
]

const EMPTY_STATE: Record<ModuleKey, ModuleState> = {
  backlog: { draftIds: [], status: { kind: "idle" } },
  stakeholders: { draftIds: [], status: { kind: "idle" } },
  risks: { draftIds: [], status: { kind: "idle" } },
}

/** Per-module API surface — uniform shape across PROJ-70/88/89 lets the
 *  conductor treat them generically. */
const API = {
  backlog: {
    list: listProposalFromContextSuggestions,
    trigger: triggerProposalFromContext,
    accept: acceptProposalFromContext,
    undo: undoProposalFromContextAccept,
  },
  stakeholders: {
    list: listStakeholderProposalSuggestions,
    trigger: triggerStakeholderProposals,
    accept: acceptStakeholderProposals,
    undo: undoStakeholderProposalsAccept,
  },
  risks: {
    list: listRiskProposalSuggestions,
    trigger: triggerRiskProposals,
    accept: acceptRiskProposals,
    undo: undoRiskProposalsAccept,
  },
} as const

export function OrchestrationTab({
  projectId,
  autoGenerateContextSourceId = null,
}: OrchestrationTabProps) {
  const [modules, setModules] =
    React.useState<Record<ModuleKey, ModuleState>>(EMPTY_STATE)
  const [generating, setGenerating] = React.useState(false)
  const [accepting, setAccepting] = React.useState(false)

  // Shared source: existing context_source (dropdown) or fresh upload.
  const [sources, setSources] = React.useState<ContextSourceOption[]>([])
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>("")
  const [pickedFile, setPickedFile] = React.useState<File | null>(null)

  /** Refresh draft ids per module (so Accept-All never sends stale ids —
   *  the bulk RPCs 400 on a non-draft id). Returns the fresh map. */
  const refreshDrafts = React.useCallback(async () => {
    const [bk, sh, rk] = await Promise.all([
      API.backlog.list(projectId, { status: "draft" }).catch(() => []),
      API.stakeholders.list(projectId, { status: "draft" }).catch(() => []),
      API.risks.list(projectId, { status: "draft" }).catch(() => []),
    ])
    const next: Record<ModuleKey, string[]> = {
      backlog: bk.map((s) => s.id),
      stakeholders: sh.map((s) => s.id),
      risks: rk.map((s) => s.id),
    }
    setModules((prev) => ({
      backlog: { ...prev.backlog, draftIds: next.backlog },
      stakeholders: { ...prev.stakeholders, draftIds: next.stakeholders },
      risks: { ...prev.risks, draftIds: next.risks },
    }))
    return next
  }, [projectId])

  // One-shot side data: existing kickoff sources + initial draft counts.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/context-sources?project_id=${projectId}`,
          { cache: "no-store" },
        )
        if (!cancelled && res.ok) {
          const body = (await res.json()) as {
            context_sources?: ContextSourceOption[]
            sources?: ContextSourceOption[]
          }
          const rows = body.context_sources ?? body.sources ?? []
          setSources(rows)
          if (rows.length > 0) setSelectedSourceId(rows[0]!.id)
        }
      } catch {
        // best-effort — upload path still works without the dropdown
      }
      if (!cancelled) await refreshDrafts()
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, refreshDrafts])

  const setRow = React.useCallback((key: ModuleKey, status: RowStatus) => {
    setModules((prev) => ({ ...prev, [key]: { ...prev[key], status } }))
  }, [])

  /** Resolve the shared source id, uploading the picked file first if any. */
  const resolveSourceId = React.useCallback(async (): Promise<
    string | null
  > => {
    if (pickedFile) {
      const lower = pickedFile.name.toLowerCase()
      const inferredKind =
        lower.endsWith(".eml") || lower.endsWith(".msg")
          ? "email"
          : lower.endsWith(".md")
            ? "meeting_notes"
            : "document"
      const uploaded = await uploadContextSourceFile({
        file: pickedFile,
        kind: inferredKind,
        title: pickedFile.name,
        projectId,
      })
      return uploaded.id
    }
    return selectedSourceId || null
  }, [pickedFile, projectId, selectedSourceId])

  /** SEQUENTIAL Generate-All over the three purposes for one shared source.
   *  Each module isolated: a throw/blocked sets its row, loop continues. */
  const runGenerateAll = React.useCallback(
    async (sourceId: string) => {
      setGenerating(true)
      // Keep the dropdown in sync with the source actually generated
      // (covers the deep-link auto-run where the source comes from the URL).
      setSelectedSourceId(sourceId)
      // reset rows to running-pending
      setModules((prev) => ({
        backlog: { ...prev.backlog, status: { kind: "idle" } },
        stakeholders: { ...prev.stakeholders, status: { kind: "idle" } },
        risks: { ...prev.risks, status: { kind: "idle" } },
      }))
      try {
        for (const { key } of MODULES) {
          setRow(key, { kind: "running" })
          try {
            const result = await API[key].trigger(projectId, {
              contextSourceId: sourceId,
              count: 10,
            })
            if (result.status === "error") {
              setRow(key, {
                kind: "error",
                reason: result.error_message ?? "Unbekannter Fehler",
              })
            } else if (result.external_blocked) {
              setRow(key, {
                kind: "blocked",
                reason:
                  result.error_message ??
                  "KI-Lauf blockiert (Datenklasse oder Cost-Cap).",
              })
            } else {
              setRow(key, {
                kind: "done",
                count: result.suggestion_ids.length,
              })
            }
          } catch (err) {
            setRow(key, {
              kind: "error",
              reason: err instanceof Error ? err.message : "Fehler",
            })
          }
        }
        await refreshDrafts()
      } finally {
        setGenerating(false)
        setPickedFile(null)
      }
    },
    [projectId, refreshDrafts, setRow],
  )

  const onGenerateAll = React.useCallback(async () => {
    let sourceId: string | null
    try {
      sourceId = await resolveSourceId()
    } catch (err) {
      toast.error("Upload fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
      return
    }
    if (!sourceId) {
      toast.error("Bitte eine Kickoff-Quelle wählen oder eine Datei hochladen.")
      return
    }
    await runGenerateAll(sourceId)
  }, [resolveSourceId, runGenerateAll])

  // PROJ-90 AC-90.2 — wizard `?aiDrawer=fill` deep-link auto-runs once.
  const autoRanRef = React.useRef(false)
  React.useEffect(() => {
    if (autoRanRef.current) return
    const sourceId = autoGenerateContextSourceId
    if (!sourceId) return
    autoRanRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep-link auto-run (wizard ?aiDrawer=fill), guarded by autoRanRef
    void runGenerateAll(sourceId)
  }, [autoGenerateContextSourceId, runGenerateAll])

  /** Show ONE undo toast that fans out over the given per-module accepted
   *  ids (AC-90.3). Best-effort per module. */
  const showUndoToast = React.useCallback(
    (acceptedByModule: Partial<Record<ModuleKey, string[]>>, total: number) => {
      if (total === 0) return
      toast.success(
        total === 1
          ? "1 Vorschlag akzeptiert"
          : `${total} Vorschläge akzeptiert`,
        {
          duration: 30_000,
          action: {
            label: "Rückgängig",
            onClick: () => {
              void (async () => {
                const results = await Promise.allSettled(
                  (Object.keys(acceptedByModule) as ModuleKey[])
                    .filter((k) => (acceptedByModule[k]?.length ?? 0) > 0)
                    .map((k) =>
                      API[k].undo(projectId, acceptedByModule[k]!),
                    ),
                )
                const failed = results.filter(
                  (r) => r.status === "rejected",
                ).length
                if (failed === 0) {
                  toast.success("Akzeptanz rückgängig gemacht")
                } else {
                  toast.warning(
                    `Teilweise rückgängig gemacht — ${failed} Modul(e) konnten nicht zurückgenommen werden (Undo-Fenster abgelaufen?).`,
                  )
                }
                await refreshDrafts()
              })()
            },
          },
        },
      )
    },
    [projectId, refreshDrafts],
  )

  /** Accept a set of modules. Re-fetches current drafts first so we never
   *  send stale ids. */
  const acceptModules = React.useCallback(
    async (keys: ModuleKey[]) => {
      setAccepting(true)
      try {
        const fresh = await refreshDrafts()
        const acceptedByModule: Partial<Record<ModuleKey, string[]>> = {}
        let total = 0
        for (const key of keys) {
          const ids = fresh[key]
          if (ids.length === 0) continue
          try {
            const result = await API[key].accept(projectId, ids)
            acceptedByModule[key] = result.accepted_suggestion_ids
            total += result.accepted_suggestion_ids.length
          } catch (err) {
            toast.error(`Akzeptieren fehlgeschlagen (${key})`, {
              description:
                err instanceof Error ? err.message : "Unbekannter Fehler",
            })
          }
        }
        showUndoToast(acceptedByModule, total)
        await refreshDrafts()
      } finally {
        setAccepting(false)
      }
    },
    [projectId, refreshDrafts, showUndoToast],
  )

  const totalDrafts =
    modules.backlog.draftIds.length +
    modules.stakeholders.draftIds.length +
    modules.risks.draftIds.length
  const busy = generating || accepting

  return (
    <div className="space-y-3" data-testid="orchestration-tab">
      {/* Shared source picker */}
      <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/10 p-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="orchestration-source-select"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Gemeinsame Kickoff-Quelle (für Backlog + Stakeholder + Risiken)
          </label>
          <select
            id="orchestration-source-select"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={pickedFile ? "" : selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            disabled={busy || pickedFile != null || sources.length === 0}
            data-testid="orchestration-source-select"
          >
            {sources.length === 0 && (
              <option value="">Keine Kickoff-Quelle vorhanden</option>
            )}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.kind})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="orchestration-file-input"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              … oder Datei hochladen (PDF · DOCX · TXT · MD · EML · MSG)
            </label>
            <input
              id="orchestration-file-input"
              type="file"
              accept=".pdf,.docx,.txt,.md,.eml,.msg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,message/rfc822,application/vnd.ms-outlook"
              className="h-8 w-full text-sm file:mr-2 file:rounded file:border file:border-input file:bg-background file:px-2 file:py-0.5 file:text-xs"
              onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void onGenerateAll()}
            disabled={busy || (!pickedFile && !selectedSourceId)}
            data-testid="orchestration-generate-all"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {generating ? "Generiere …" : "Alles generieren"}
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
        Generiert Backlog, Stakeholder und Risiken aus einer Kickoff-Quelle —
        nacheinander, jedes Modul für sich. Stakeholder läuft Class-3 lokal
        (Ollama); blockiert ein Modul, laufen die anderen weiter. Du reviewst
        in den jeweiligen Tabs und akzeptierst hier pro Modul oder alles auf
        einmal. 30&nbsp;s Undo nach dem Akzeptieren.
      </p>

      {/* Progress / per-module rows */}
      <div className="space-y-1.5">
        {MODULES.map(({ key, label }) => (
          <ModuleRow
            key={key}
            label={label}
            state={modules[key]}
            busy={busy}
            onAccept={() => void acceptModules([key])}
          />
        ))}
      </div>

      {/* Global Accept-All */}
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {totalDrafts} offene Vorschläge insgesamt
        </span>
        <Button
          size="sm"
          onClick={() =>
            void acceptModules(["backlog", "stakeholders", "risks"])
          }
          disabled={busy || totalDrafts === 0}
          data-testid="orchestration-accept-all"
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Alles akzeptieren ({totalDrafts})
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Module progress row
// ---------------------------------------------------------------------------

interface ModuleRowProps {
  label: string
  state: ModuleState
  busy: boolean
  onAccept: () => void
}

function ModuleRow({ label, state, busy, onAccept }: ModuleRowProps) {
  const { status, draftIds } = state
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2 text-sm"
      data-testid={`orchestration-row-${label.toLowerCase()}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon status={status} />
        <span className="font-medium">{label}</span>
        <StatusText status={status} draftCount={draftIds.length} />
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onAccept}
        disabled={busy || draftIds.length === 0}
        data-testid={`orchestration-accept-${label.toLowerCase()}`}
      >
        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Annehmen ({draftIds.length})
      </Button>
    </div>
  )
}

function StatusIcon({ status }: { status: RowStatus }) {
  switch (status.kind) {
    case "running":
      return (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-violet-500"
          aria-hidden
        />
      )
    case "done":
      return (
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
          aria-hidden
        />
      )
    case "blocked":
      return (
        <ServerOff
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden
        />
      )
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
    default:
      return (
        <CircleDashed
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )
  }
}

function StatusText({
  status,
  draftCount,
}: {
  status: RowStatus
  draftCount: number
}) {
  switch (status.kind) {
    case "running":
      return (
        <span className="text-xs text-muted-foreground">generiert …</span>
      )
    case "done":
      return (
        <Badge variant="outline" className="text-[10px]">
          {status.count} generiert
        </Badge>
      )
    case "blocked":
      return (
        <span
          className="truncate text-xs text-amber-700 dark:text-amber-300"
          title={status.reason}
        >
          blockiert
        </span>
      )
    case "error":
      return (
        <span
          className="truncate text-xs text-destructive"
          title={status.reason}
        >
          Fehler
        </span>
      )
    default:
      return (
        <span className="text-xs text-muted-foreground">
          {draftCount > 0 ? `${draftCount} offen` : "bereit"}
        </span>
      )
  }
}
