"use client"

/**
 * PROJ-89 — Risk-Proposal tab inside AIProposalDrawer (tab 6).
 *
 * Flat suggestion cards (risks have no hierarchy) derived from a kickoff
 * context_source, mapped onto the PROJ-20 risk shape. User actions:
 *   - Generate (existing context_source via dropdown OR fresh upload —
 *     PROJ-70-γ picker reuse, mirror of the stakeholder tab)
 *   - Inline-edit title / description / probability / impact /
 *     mitigation (PATCH, purpose-aware; relevance preserved server-side)
 *   - Accept single / all (bulk RPC → risks with status 'open') ·
 *     Reject single / all
 *   - Undo within 30 s after any accept (sonner toast action)
 *
 * Classification is CONTENT-BASED (AC-89.2): clean documents route to
 * the tenant cloud provider; PII in the document (or a Class-3-stamped
 * source) clamps to the local provider. When the run comes back
 * `external_blocked` this tab shows a persistent banner with the
 * router's actionable reason (PROJ-88 F-1 pattern) — no silent empty
 * list.
 */

import * as React from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Link2,
  Pencil,
  ServerOff,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  acceptRiskProposals,
  editRiskProposalSuggestion,
  listRiskProposalSuggestions,
  rejectRiskProposalSuggestion,
  triggerRiskProposals,
  undoRiskProposalsAccept,
  type RiskProposalSuggestionPayload,
  type RiskProposalSuggestionRow,
} from "@/lib/ai-proposals/risk-proposals-api"
import { uploadContextSourceFile } from "@/lib/ai-proposals/proposal-from-context-api"

interface RiskProposalTabProps {
  projectId: string
}

interface ContextSourceOption {
  id: string
  title: string
  kind: string
  created_at: string
}

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrige Konfidenz",
  medium: "Mittlere Konfidenz",
  high: "Hohe Konfidenz",
}

/** P×I score → severity bucket for the badge tint (mirrors the PROJ-20
 *  risks module thresholds: ≥15 critical, ≥8 elevated, else low). */
function scoreClass(score: number): string {
  if (score >= 15)
    return "border-rose-400/50 text-rose-700 dark:text-rose-300"
  if (score >= 8)
    return "border-amber-400/50 text-amber-700 dark:text-amber-300"
  return "border-emerald-400/50 text-emerald-700 dark:text-emerald-300"
}

export function RiskProposalTab({ projectId }: RiskProposalTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    RiskProposalSuggestionRow[]
  >([])
  const [busy, setBusy] = React.useState(false)
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null)

  // Source selection: existing context_source (dropdown) or fresh upload.
  const [sources, setSources] = React.useState<ContextSourceOption[]>([])
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>("")
  const [pickedFile, setPickedFile] = React.useState<File | null>(null)

  const [editingId, setEditingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listRiskProposalSuggestions(projectId)
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

  // One-shot side data: existing kickoff sources for the dropdown.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const srcRes = await fetch(
          `/api/context-sources?project_id=${projectId}`,
          { cache: "no-store" },
        )
        if (!cancelled && srcRes.ok) {
          const body = (await srcRes.json()) as {
            context_sources?: ContextSourceOption[]
            sources?: ContextSourceOption[]
          }
          const rows = body.context_sources ?? body.sources ?? []
          setSources(rows)
          if (rows.length > 0) setSelectedSourceId(rows[0]!.id)
        }
      } catch {
        // Side data is best-effort: generation works without the dropdown
        // (upload path).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const drafts = suggestions.filter((s) => s.status === "draft")
  const others = suggestions.filter((s) => s.status !== "draft")

  const showUndoToast = React.useCallback(
    (acceptedIds: string[], createdCount: number, linkedCount: number) => {
      const label =
        acceptedIds.length === 1
          ? "1 Risiko-Vorschlag akzeptiert"
          : `${acceptedIds.length} Risiko-Vorschläge akzeptiert`
      const detail =
        linkedCount > 0
          ? `${createdCount} neu im Register · ${linkedCount} mit Bestand verknüpft`
          : `${createdCount} neu im Register`
      toast.success(`${label} (${detail})`, {
        duration: 30_000,
        action: {
          label: "Rückgängig",
          onClick: () => {
            void (async () => {
              try {
                await undoRiskProposalsAccept(projectId, acceptedIds)
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
    let contextSourceId = selectedSourceId
    setBusy(true)
    try {
      if (pickedFile) {
        const lowerName = pickedFile.name.toLowerCase()
        const inferredKind =
          lowerName.endsWith(".eml") || lowerName.endsWith(".msg")
            ? "email"
            : lowerName.endsWith(".md")
              ? "meeting_notes"
              : "document"
        const uploaded = await uploadContextSourceFile({
          file: pickedFile,
          kind: inferredKind,
          title: pickedFile.name,
          projectId,
        })
        contextSourceId = uploaded.id
      }
      if (!contextSourceId) {
        toast.error(
          "Bitte eine Kickoff-Quelle wählen oder eine Datei hochladen.",
        )
        return
      }

      const result = await triggerRiskProposals(projectId, {
        contextSourceId,
        count: 10,
      })

      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        // Content-based purpose: blocked means Class-3 detected without an
        // eligible local provider (or cost-cap). Persistent banner with the
        // router's actionable reason (PROJ-88 F-1).
        setBlockedReason(
          result.error_message ??
            "KI-Lauf blockiert — kein geeigneter Provider für die Datenklasse.",
        )
      } else {
        setBlockedReason(null)
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keine Risikosignale im Dokument gefunden."
            : `${result.suggestion_ids.length} Risiko-Vorschlag${result.suggestion_ids.length === 1 ? "" : "e"} abgeleitet`,
        )
        setPickedFile(null)
      }
      await reload()
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }, [pickedFile, projectId, reload, selectedSourceId])

  const onAccept = React.useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      setBusy(true)
      try {
        const result = await acceptRiskProposals(projectId, ids)
        showUndoToast(
          result.accepted_suggestion_ids,
          result.created_risk_ids.length,
          result.linked_risk_ids.length,
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

  const onRejectOne = React.useCallback(
    async (suggestion: RiskProposalSuggestionRow) => {
      setBusy(true)
      try {
        await rejectRiskProposalSuggestion(suggestion.id)
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
      await Promise.all(drafts.map((s) => rejectRiskProposalSuggestion(s.id)))
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

  /** Persist an inline edit via the purpose-aware PATCH. The bulk RPC
   *  reads payloads from the DB, so edits must be flushed immediately. */
  const onPatchPayload = React.useCallback(
    async (
      suggestion: RiskProposalSuggestionRow,
      patch: Partial<RiskProposalSuggestionPayload>,
    ) => {
      setBusy(true)
      try {
        const updated = await editRiskProposalSuggestion(suggestion.id, {
          ...suggestion.payload,
          ...patch,
        })
        toast.success("Vorschlag aktualisiert")
        setEditingId(null)
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestion.id
              ? { ...s, payload: updated.payload, is_modified: true }
              : s,
          ),
        )
      } catch (err) {
        toast.error("Aktualisierung fehlgeschlagen", {
          description:
            err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return (
    <div className="space-y-3" data-testid="risk-proposal-tab">
      {/* Source picker: existing kickoff source OR fresh upload */}
      <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/10 p-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="risk-proposal-source-select"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Kickoff-Quelle (vorhandene Quelle oder neue Datei)
          </label>
          <select
            id="risk-proposal-source-select"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={pickedFile ? "" : selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            disabled={busy || pickedFile != null || sources.length === 0}
            data-testid="risk-proposal-source-select"
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
              htmlFor="risk-proposal-file-input"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              … oder Datei hochladen (PDF · DOCX · TXT · MD · EML · MSG)
            </label>
            <input
              id="risk-proposal-file-input"
              type="file"
              accept=".pdf,.docx,.txt,.md,.eml,.msg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,message/rfc822,application/vnd.ms-outlook"
              className="h-8 w-full text-sm file:mr-2 file:rounded file:border file:border-input file:bg-background file:px-2 file:py-0.5 file:text-xs"
              onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void onGenerate()}
            disabled={busy || (!pickedFile && !selectedSourceId)}
            data-testid="risk-proposal-generate"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {busy ? "Lädt …" : "Risiken ableiten"}
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
        KI leitet Projektrisiken aus dem Kickoff-Dokument ab — saubere
        Dokumente laufen über den Cloud-Provider deines Tenants,
        personenbezogene Inhalte automatisch lokal (Class-3-Routing).
        Akzeptierte Risiken landen als echte Einträge im Risikoregister
        (PROJ-20). 30&nbsp;s Undo nach jedem Accept.
      </p>

      {/* Blocked banner (Class-3 without local provider / cost-cap) */}
      {blockedReason && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
          data-testid="risk-proposal-blocked-banner"
        >
          <ServerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>KI-Lauf blockiert.</strong> {blockedReason} Ein
            Tenant-Admin kann unter{" "}
            <Link
              href="/settings/tenant/ai-providers"
              className="underline underline-offset-2"
            >
              Einstellungen → KI-Provider
            </Link>{" "}
            die Provider-Konfiguration anpassen.
          </span>
        </div>
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
              disabled={busy}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Alle ablehnen
            </Button>
            <Button
              size="sm"
              onClick={() => void onAccept(drafts.map((d) => d.id))}
              disabled={busy}
              data-testid="risk-proposal-accept-all"
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
          Noch keine Risiko-Vorschläge. Wähle oben eine Kickoff-Quelle und
          klicke „Risiken ableiten&ldquo;.
        </div>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Offen
          </h3>
          {drafts.map((s) => (
            <RiskProposalCard
              key={s.id}
              suggestion={s}
              busy={busy}
              isEditing={editingId === s.id}
              onStartEdit={() => setEditingId(s.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(patch) => void onPatchPayload(s, patch)}
              onAccept={() => void onAccept([s.id])}
              onReject={() => void onRejectOne(s)}
            />
          ))}
        </section>
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
                  {s.accepted_entity_type === "risk_link" && (
                    <Badge variant="outline" className="text-[9px]">
                      verknüpft
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface RiskProposalCardProps {
  suggestion: RiskProposalSuggestionRow
  busy: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (patch: Partial<RiskProposalSuggestionPayload>) => void
  onAccept: () => void
  onReject: () => void
}

function RiskProposalCard({
  suggestion,
  busy,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onAccept,
  onReject,
}: RiskProposalCardProps) {
  const p = suggestion.payload
  const score = p.probability * p.impact
  const isDuplicate = p.duplicate_of_risk_id != null

  return (
    <article
      className="rounded-md border bg-card p-3 text-sm"
      data-testid="risk-proposal-card"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert
            className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300"
            aria-hidden
          />
          <span className="truncate font-medium">{p.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className={`text-[10px] ${scoreClass(score)}`}
            title={`Wahrscheinlichkeit ${p.probability} × Auswirkung ${p.impact}`}
          >
            P{p.probability} × A{p.impact} = {score}
          </Badge>
          {p.relevance === "off_goal" && (
            <Badge
              variant="outline"
              className="border-rose-400/50 text-[10px] text-rose-600 dark:text-rose-300"
              title="Stammt aus dem Kickoff, passt aber nicht zum Vorhaben"
            >
              ≠ Ziel
            </Badge>
          )}
        </div>
      </header>

      {isEditing ? (
        <RiskInlineEditor
          payload={p}
          busy={busy}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
        />
      ) : (
        <>
          {p.description && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {p.description}
            </p>
          )}
          {p.mitigation && (
            <p className="mt-1.5 text-xs">
              <span className="font-medium">Maßnahme:</span> {p.mitigation}
            </p>
          )}
          <div className="mt-1.5 text-xs text-muted-foreground">
            {CONFIDENCE_LABEL[p.confidence]}
          </div>
          {p.source_quote && (
            <p className="mt-1.5 border-l-2 border-muted pl-2 text-[11px] italic text-muted-foreground">
              „{p.source_quote}&ldquo;
            </p>
          )}
          {isDuplicate && (
            <p className="mt-1.5 flex items-center gap-1.5 rounded bg-sky-500/5 px-2 py-1 text-[11px] text-sky-700 dark:text-sky-300">
              <Link2 className="h-3 w-3 shrink-0" aria-hidden />
              Bereits im Risikoregister — Accept verknüpft statt neu
              anzulegen.
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onStartEdit}
              disabled={busy}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Bearbeiten
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={busy}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Ablehnen
            </Button>
            <Button
              size="sm"
              onClick={onAccept}
              disabled={busy}
              data-testid="risk-proposal-accept"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Annehmen
            </Button>
          </div>
        </>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Inline editor (sub-component so input state lives outside the card —
// no set-state-in-effect, mirrors the stakeholder-tab editor pattern)
// ---------------------------------------------------------------------------

interface RiskInlineEditorProps {
  payload: RiskProposalSuggestionPayload
  busy: boolean
  onCancel: () => void
  onSave: (patch: Partial<RiskProposalSuggestionPayload>) => void
}

function RiskInlineEditor({
  payload,
  busy,
  onCancel,
  onSave,
}: RiskInlineEditorProps) {
  const [title, setTitle] = React.useState(payload.title)
  const [description, setDescription] = React.useState(
    payload.description ?? "",
  )
  const [probability, setProbability] = React.useState(payload.probability)
  const [impact, setImpact] = React.useState(payload.impact)
  const [mitigation, setMitigation] = React.useState(payload.mitigation ?? "")

  return (
    <div className="mt-2 space-y-2" data-testid="risk-proposal-editor">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={255}
        placeholder="Titel"
        disabled={busy}
        aria-label="Titel"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
        placeholder="Beschreibung (optional)"
        disabled={busy}
        rows={2}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        aria-label="Beschreibung"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Wahrscheinlichkeit:</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
            disabled={busy}
            aria-label="Wahrscheinlichkeit"
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Auswirkung:</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={impact}
            onChange={(e) => setImpact(Number(e.target.value))}
            disabled={busy}
            aria-label="Auswirkung"
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={mitigation}
        onChange={(e) => setMitigation(e.target.value)}
        maxLength={5000}
        placeholder="Maßnahme (optional)"
        disabled={busy}
        rows={2}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        aria-label="Maßnahme"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Abbrechen
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              title: title.trim(),
              description: description.trim() || null,
              probability,
              impact,
              mitigation: mitigation.trim() || null,
            })
          }
          disabled={busy || title.trim().length === 0}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Speichern
        </Button>
      </div>
    </div>
  )
}