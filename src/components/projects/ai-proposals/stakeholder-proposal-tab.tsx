"use client"

/**
 * PROJ-88 — Stakeholder-Proposal tab inside AIProposalDrawer (tab 5).
 *
 * Flat suggestion cards (stakeholders have no hierarchy — Tech-Design
 * L6) extracted from a kickoff context_source. User actions:
 *   - Generate (existing context_source via dropdown OR fresh upload —
 *     PROJ-70-γ picker reuse)
 *   - Inline-edit name / kind / origin / role_key (PATCH, purpose-aware)
 *   - Per-card accept options: "auch als Resource anlegen" toggle (L2)
 *     + member picker (existing tenant members only, invariant #4) —
 *     both persisted into the payload via PATCH before accept
 *   - Accept single / all (bulk RPC) · Reject single / all
 *   - Undo within 30 s after any accept (sonner toast action)
 *
 * Class-3 by design: the purpose is pinned server-side; when no local
 * provider (Ollama) is configured the run returns `external_blocked`
 * and this tab shows the "Lokaler KI-Provider erforderlich" banner
 * with a link to the tenant AI settings (AC-88.3) — no silent empty list.
 */

import * as React from "react"
import Link from "next/link"
import {
  Building2,
  CheckCircle2,
  Link2,
  Pencil,
  ServerOff,
  Sparkles,
  User,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  acceptStakeholderProposals,
  editStakeholderProposalSuggestion,
  listStakeholderProposalSuggestions,
  rejectStakeholderProposalSuggestion,
  triggerStakeholderProposals,
  undoStakeholderProposalsAccept,
  type StakeholderProposalSuggestionPayload,
  type StakeholderProposalSuggestionRow,
} from "@/lib/ai-proposals/stakeholder-proposals-api"
import { uploadContextSourceFile } from "@/lib/ai-proposals/proposal-from-context-api"

interface StakeholderProposalTabProps {
  projectId: string
}

interface ContextSourceOption {
  id: string
  title: string
  kind: string
  created_at: string
}

interface MemberOption {
  user_id: string
  display_name: string
}

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrige Konfidenz",
  medium: "Mittlere Konfidenz",
  high: "Hohe Konfidenz",
}

export function StakeholderProposalTab({
  projectId,
}: StakeholderProposalTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    StakeholderProposalSuggestionRow[]
  >([])
  const [busy, setBusy] = React.useState(false)
  const [localProviderMissing, setLocalProviderMissing] = React.useState(false)

  // Source selection: existing context_source (dropdown) or fresh upload.
  const [sources, setSources] = React.useState<ContextSourceOption[]>([])
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>("")
  const [pickedFile, setPickedFile] = React.useState<File | null>(null)

  // Member picker options (existing tenant members with a login).
  const [members, setMembers] = React.useState<MemberOption[]>([])

  const [editingId, setEditingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listStakeholderProposalSuggestions(projectId)
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

  // One-shot side data: existing kickoff sources + member options.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [srcRes, plRes] = await Promise.all([
          fetch(`/api/context-sources?project_id=${projectId}`, {
            cache: "no-store",
          }),
          fetch(`/api/projects/${projectId}/participant-links`, {
            cache: "no-store",
          }),
        ])
        if (!cancelled && srcRes.ok) {
          const body = (await srcRes.json()) as {
            context_sources?: ContextSourceOption[]
            sources?: ContextSourceOption[]
          }
          const rows = body.context_sources ?? body.sources ?? []
          setSources(rows)
          if (rows.length > 0) setSelectedSourceId(rows[0]!.id)
        }
        if (!cancelled && plRes.ok) {
          const body = (await plRes.json()) as {
            participant_links?: {
              participants?: Array<{
                user_id: string | null
                display_name: string
              }>
            }
          }
          const participants = body.participant_links?.participants ?? []
          setMembers(
            participants
              .filter(
                (p): p is { user_id: string; display_name: string } =>
                  p.user_id != null,
              )
              .map((p) => ({
                user_id: p.user_id,
                display_name: p.display_name,
              })),
          )
        }
      } catch {
        // Side data is best-effort: generation works without the dropdown
        // (upload path) and without member options (no link picked).
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
          ? "1 Stakeholder-Vorschlag akzeptiert"
          : `${acceptedIds.length} Stakeholder-Vorschläge akzeptiert`
      const detail =
        linkedCount > 0
          ? `${createdCount} neu angelegt · ${linkedCount} mit Bestand verknüpft`
          : `${createdCount} neu angelegt`
      toast.success(`${label} (${detail})`, {
        duration: 30_000,
        action: {
          label: "Rückgängig",
          onClick: () => {
            void (async () => {
              try {
                await undoStakeholderProposalsAccept(projectId, acceptedIds)
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

      const result = await triggerStakeholderProposals(projectId, {
        contextSourceId,
        count: 10,
      })

      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        // AC-88.3 — Class-3-pinned purpose without a local provider is a
        // hard, by-design block. Persistent banner instead of a toast.
        setLocalProviderMissing(true)
      } else {
        setLocalProviderMissing(false)
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keine Stakeholder im Dokument gefunden."
            : `${result.suggestion_ids.length} Stakeholder-Vorschlag${result.suggestion_ids.length === 1 ? "" : "e"} extrahiert`,
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
        const result = await acceptStakeholderProposals(projectId, ids)
        showUndoToast(
          result.accepted_suggestion_ids,
          result.created_stakeholder_ids.length,
          result.linked_stakeholder_ids.length,
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
    async (suggestion: StakeholderProposalSuggestionRow) => {
      setBusy(true)
      try {
        await rejectStakeholderProposalSuggestion(suggestion.id)
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
        drafts.map((s) => rejectStakeholderProposalSuggestion(s.id)),
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

  /** Persist a payload patch (accept options or inline edit) via the
   *  purpose-aware PATCH. The bulk RPC reads payloads from the DB, so
   *  toggles must be flushed immediately, not at accept time. */
  const onPatchPayload = React.useCallback(
    async (
      suggestion: StakeholderProposalSuggestionRow,
      patch: Partial<StakeholderProposalSuggestionPayload>,
      successMessage: string | null,
    ) => {
      setBusy(true)
      try {
        const updated = await editStakeholderProposalSuggestion(suggestion.id, {
          ...suggestion.payload,
          ...patch,
        })
        if (successMessage) toast.success(successMessage)
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
    <div className="space-y-3" data-testid="stakeholder-proposal-tab">
      {/* Source picker: existing kickoff source OR fresh upload */}
      <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/10 p-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="stakeholder-proposal-source-select"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Kickoff-Quelle (vorhandene Quelle oder neue Datei)
          </label>
          <select
            id="stakeholder-proposal-source-select"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={pickedFile ? "" : selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            disabled={busy || pickedFile != null || sources.length === 0}
            data-testid="stakeholder-proposal-source-select"
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
              htmlFor="stakeholder-proposal-file-input"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              … oder Datei hochladen (PDF · DOCX · TXT · MD · EML · MSG)
            </label>
            <input
              id="stakeholder-proposal-file-input"
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
            data-testid="stakeholder-proposal-generate"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {busy ? "Lädt …" : "Stakeholder extrahieren"}
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
        KI extrahiert die im Kickoff-Dokument genannten Stakeholder — läuft
        ausschließlich auf dem lokalen KI-Provider deines Tenants (Class-3).
        Du reviewst jede Karte, wählst optional „als Resource anlegen&ldquo;
        oder einen Member-Link und akzeptierst einzeln oder bulk. 30&nbsp;s
        Undo nach jedem Accept.
      </p>

      {/* AC-88.3 — local provider required (by design, not an error) */}
      {localProviderMissing && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
          data-testid="stakeholder-proposal-local-provider-banner"
        >
          <ServerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Lokaler KI-Provider (Ollama) erforderlich.</strong>{" "}
            Stakeholder-Extraktion verarbeitet personenbezogene Daten
            (Class-3) und läuft deshalb nie über Cloud-Provider. Ein
            Tenant-Admin kann unter{" "}
            <Link
              href="/settings/tenant/ai-providers"
              className="underline underline-offset-2"
            >
              Einstellungen → KI-Provider
            </Link>{" "}
            einen Ollama-Endpoint hinterlegen.
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
              data-testid="stakeholder-proposal-accept-all"
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
          Noch keine Stakeholder-Vorschläge. Wähle oben eine Kickoff-Quelle
          und klicke „Stakeholder extrahieren&ldquo;.
        </div>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Offen
          </h3>
          {drafts.map((s) => (
            <StakeholderProposalCard
              key={s.id}
              suggestion={s}
              members={members}
              busy={busy}
              isEditing={editingId === s.id}
              onStartEdit={() => setEditingId(s.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(patch) =>
                void onPatchPayload(s, patch, "Vorschlag aktualisiert")
              }
              onToggleResource={(checked) =>
                void onPatchPayload(s, { create_resource: checked }, null)
              }
              onPickMember={(userId) =>
                void onPatchPayload(s, { linked_user_id: userId }, null)
              }
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
                  <span className="truncate">{s.payload.name}</span>
                  {s.accepted_entity_type === "stakeholder_link" && (
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

interface StakeholderProposalCardProps {
  suggestion: StakeholderProposalSuggestionRow
  members: MemberOption[]
  busy: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (patch: Partial<StakeholderProposalSuggestionPayload>) => void
  onToggleResource: (checked: boolean) => void
  onPickMember: (userId: string | null) => void
  onAccept: () => void
  onReject: () => void
}

function StakeholderProposalCard({
  suggestion,
  members,
  busy,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleResource,
  onPickMember,
  onAccept,
  onReject,
}: StakeholderProposalCardProps) {
  const p = suggestion.payload
  const KindIcon = p.kind === "organization" ? Building2 : User
  const isDuplicate = p.duplicate_of_stakeholder_id != null

  return (
    <article
      className="rounded-md border bg-card p-3 text-sm"
      data-testid="stakeholder-proposal-card"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KindIcon
            className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300"
            aria-hidden
          />
          <span className="truncate font-medium">{p.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {p.kind === "organization" ? "Organisation" : "Person"}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {p.origin === "internal" ? "intern" : "extern"}
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
        <StakeholderInlineEditor
          payload={p}
          busy={busy}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
        />
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {p.role_key && <span>Rolle: {p.role_key}</span>}
            {p.org_unit && <span>Einheit: {p.org_unit}</span>}
            {p.contact_email && <span>{p.contact_email}</span>}
            {p.contact_phone && <span>{p.contact_phone}</span>}
            <span>{CONFIDENCE_LABEL[p.confidence]}</span>
          </div>
          {p.source_quote && (
            <p className="mt-1.5 border-l-2 border-muted pl-2 text-[11px] italic text-muted-foreground">
              „{p.source_quote}&ldquo;
            </p>
          )}
          {isDuplicate && (
            <p className="mt-1.5 flex items-center gap-1.5 rounded bg-sky-500/5 px-2 py-1 text-[11px] text-sky-700 dark:text-sky-300">
              <Link2 className="h-3 w-3 shrink-0" aria-hidden />
              Bereits als Stakeholder vorhanden — Accept verknüpft statt neu
              anzulegen.
            </p>
          )}

          {/* Accept options — disabled for duplicates (nothing is created) */}
          {!isDuplicate && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/10 px-2 py-1.5 text-xs">
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={p.create_resource ?? false}
                  onCheckedChange={onToggleResource}
                  disabled={busy}
                  aria-label="Auch als Resource anlegen"
                  data-testid="stakeholder-proposal-resource-toggle"
                />
                <span>auch als Resource anlegen</span>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Member-Link:</span>
                <select
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                  value={p.linked_user_id ?? ""}
                  onChange={(e) => onPickMember(e.target.value || null)}
                  disabled={busy || members.length === 0}
                  aria-label="Mit existierendem Tenant-Member verknüpfen"
                  data-testid="stakeholder-proposal-member-picker"
                >
                  <option value="">kein Link</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
              data-testid="stakeholder-proposal-accept"
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
// no set-state-in-effect, mirrors the Backlog tree-node editor pattern)
// ---------------------------------------------------------------------------

interface StakeholderInlineEditorProps {
  payload: StakeholderProposalSuggestionPayload
  busy: boolean
  onCancel: () => void
  onSave: (patch: Partial<StakeholderProposalSuggestionPayload>) => void
}

function StakeholderInlineEditor({
  payload,
  busy,
  onCancel,
  onSave,
}: StakeholderInlineEditorProps) {
  const [name, setName] = React.useState(payload.name)
  const [kind, setKind] = React.useState(payload.kind)
  const [origin, setOrigin] = React.useState(payload.origin)
  const [roleKey, setRoleKey] = React.useState(payload.role_key ?? "")

  return (
    <div className="mt-2 space-y-2" data-testid="stakeholder-proposal-editor">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={255}
        placeholder="Name"
        disabled={busy}
        aria-label="Name"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "person" | "organization")
          }
          disabled={busy}
          aria-label="Art"
        >
          <option value="person">Person</option>
          <option value="organization">Organisation</option>
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={origin}
          onChange={(e) =>
            setOrigin(e.target.value as "internal" | "external")
          }
          disabled={busy}
          aria-label="Herkunft"
        >
          <option value="internal">intern</option>
          <option value="external">extern</option>
        </select>
        <Input
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          maxLength={100}
          placeholder="Rolle (optional)"
          disabled={busy}
          className="h-8 flex-1 text-xs"
          aria-label="Rolle"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Abbrechen
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              name: name.trim(),
              kind,
              origin,
              role_key: roleKey.trim() || null,
            })
          }
          disabled={busy || name.trim().length === 0}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Speichern
        </Button>
      </div>
    </div>
  )
}
