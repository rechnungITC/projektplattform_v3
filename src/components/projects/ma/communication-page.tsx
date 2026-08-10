"use client"

import {
  Clock,
  Eye,
  Loader2,
  Lock,
  MessagesSquare,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useStageGates } from "@/hooks/use-stage-gates"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import {
  deleteEntry,
  listEntries,
  listTemplates,
  markSent,
  readEntryContent,
  respondApproval,
  submitEntry,
  type CommunicationEntry,
  type CommunicationTemplate,
} from "@/lib/ma-project/communication-api"
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUSES,
  TARGET_GROUP_KEYS,
  TARGET_GROUP_LABELS,
  type ApprovalStatus,
  type TargetGroupKey,
} from "@/types/communication-matrix"
import {
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  MA_CONFIDENTIALITY_LEVELS,
  type MaConfidentialityLevel,
} from "@/types/confidentiality"

import { CommunicationEntryDialog } from "./communication-entry-dialog"
import { CommunicationGovernanceSheet } from "./communication-governance-sheet"
import { CommunicationTemplatesDialog } from "./communication-templates-dialog"

const ALL = "__all__"

function levelBadgeVariant(
  l: MaConfidentialityLevel
): "default" | "secondary" | "destructive" | "outline" {
  if (l === "strict") return "destructive"
  if (l === "confidential") return "secondary"
  return "outline"
}

function statusBadgeVariant(
  s: ApprovalStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "rejected") return "destructive"
  if (s === "pending_approval") return "secondary"
  if (s === "draft") return "outline"
  return "default" // approved, sent
}

function targetGroupDisplay(e: CommunicationEntry): string {
  if ((TARGET_GROUP_KEYS as readonly string[]).includes(e.target_group_key)) {
    return TARGET_GROUP_LABELS[e.target_group_key as TargetGroupKey]
  }
  return e.target_group_label?.trim() || e.target_group_key
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" })
  } catch {
    return iso
  }
}

interface Filters {
  targetGroup: string
  status: string
  phaseId: string
  confidentiality: string
  /** AC4 — signing/closing quick-filter chip. */
  signingClosing: boolean
}

const EMPTY_FILTERS: Filters = {
  targetGroup: ALL,
  status: ALL,
  phaseId: ALL,
  confidentiality: ALL,
  signingClosing: false,
}

export function CommunicationPage({ projectId }: { projectId: string }) {
  const { user, currentTenant, currentRole } = useAuth()
  const canManage = useProjectAccess(projectId, "edit_master")
  const { phases } = usePhases(projectId)
  const { stageGates } = useStageGates(projectId)
  const { members } = useTenantMembers(currentTenant?.id ?? null)

  const [entries, setEntries] = React.useState<CommunicationEntry[]>([])
  const [templates, setTemplates] = React.useState<CommunicationTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS)
  const [dialog, setDialog] = React.useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; entry: CommunicationEntry }
  >({ mode: "closed" })
  const [approvalFor, setApprovalFor] = React.useState<CommunicationEntry | null>(
    null
  )
  const [governanceFor, setGovernanceFor] =
    React.useState<CommunicationEntry | null>(null)
  const [templatesOpen, setTemplatesOpen] = React.useState(false)

  const reload = React.useCallback(async () => {
    const [e, t] = await Promise.all([
      listEntries(projectId),
      listTemplates(projectId).catch(() => [] as CommunicationTemplate[]),
    ])
    setEntries(e)
    setTemplates(t)
    setApprovalFor((prev) => (prev ? e.find((x) => x.id === prev.id) ?? null : null))
    setGovernanceFor((prev) =>
      prev ? e.find((x) => x.id === prev.id) ?? null : null
    )
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [e, t] = await Promise.all([
          listEntries(projectId),
          listTemplates(projectId).catch(() => [] as CommunicationTemplate[]),
        ])
        if (!cancelled) {
          setEntries(e)
          setTemplates(t)
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Kommunikationsmatrix konnte nicht geladen werden."
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const phaseName = React.useMemo(() => {
    const m = new Map<string, string>()
    phases.forEach((p) => m.set(p.id, p.name))
    return m
  }, [phases])
  const gateLabel = React.useMemo(() => {
    const m = new Map<string, string>()
    stageGates.forEach((g) => m.set(g.id, g.label))
    return m
  }, [stageGates])
  const memberName = React.useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((x) =>
      m.set(x.user_id, x.display_name ?? x.email.split("@")[0] ?? "Mitglied")
    )
    return m
  }, [members])

  // AC4 — the set of phase/stage-gate ids whose name/label mentions signing or
  // closing (case-insensitive). There is no dedicated flag on entries, so the
  // Signing/Closing view is derived from the linked schedule object's name.
  const signingClosingIds = React.useMemo(() => {
    const ids = new Set<string>()
    const match = (s: string) => /signing|closing/i.test(s)
    phases.forEach((p) => {
      if (match(p.name)) ids.add(p.id)
    })
    stageGates.forEach((g) => {
      if (match(g.label)) ids.add(g.id)
    })
    return ids
  }, [phases, stageGates])

  const filtered = React.useMemo(() => {
    return entries
      .filter((e) => {
        if (filters.targetGroup !== ALL && e.target_group_key !== filters.targetGroup)
          return false
        if (filters.status !== ALL && e.approval_status !== filters.status)
          return false
        if (filters.phaseId !== ALL && e.phase_id !== filters.phaseId) return false
        if (
          filters.confidentiality !== ALL &&
          e.confidentiality_level !== filters.confidentiality
        )
          return false
        if (filters.signingClosing) {
          const linked =
            (e.phase_id && signingClosingIds.has(e.phase_id)) ||
            (e.stage_gate_id && signingClosingIds.has(e.stage_gate_id))
          if (!linked) return false
        }
        return true
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [entries, filters, signingClosingIds])

  async function handleDelete(e: CommunicationEntry) {
    if (!confirm("Kommunikationseintrag löschen?")) return
    try {
      await deleteEntry(projectId, e.id)
      toast.success("Eintrag gelöscht.")
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <MessagesSquare className="h-5 w-5" aria-hidden /> Kommunikationsmatrix
          </h1>
          <p className="text-sm text-muted-foreground">
            Geplante Kommunikation an interne und externe Zielgruppen mit
            Freigabe-Workflow. Sichtbarkeit richtet sich nach Ihrem
            Berechtigungskontext.
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTemplatesOpen(true)}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Vorlagen
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Eintrag
            </Button>
          </div>
        )}
      </div>

      {/* Filters (AC1) */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.targetGroup}
          onValueChange={(v) => setFilters((f) => ({ ...f, targetGroup: v }))}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Zielgruppe filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Zielgruppen</SelectItem>
            {TARGET_GROUP_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {TARGET_GROUP_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Status filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Status</SelectItem>
            {APPROVAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {APPROVAL_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.phaseId}
          onValueChange={(v) => setFilters((f) => ({ ...f, phaseId: v }))}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Phase filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Phasen</SelectItem>
            {phases.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.sequence_number}. {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.confidentiality}
          onValueChange={(v) => setFilters((f) => ({ ...f, confidentiality: v }))}
        >
          <SelectTrigger
            className="h-9 w-[180px]"
            aria-label="Vertraulichkeit filtern"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Vertraulichkeiten</SelectItem>
            {MA_CONFIDENTIALITY_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {MA_CONFIDENTIALITY_LEVEL_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* AC4 — Signing/Closing quick-filter chip. */}
        <Button
          size="sm"
          variant={filters.signingClosing ? "default" : "outline"}
          aria-pressed={filters.signingClosing}
          onClick={() =>
            setFilters((f) => ({ ...f, signingClosing: !f.signingClosing }))
          }
        >
          Signing / Closing
        </Button>

        {(filters.targetGroup !== ALL ||
          filters.status !== ALL ||
          filters.phaseId !== ALL ||
          filters.confidentiality !== ALL ||
          filters.signingClosing) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 py-8 text-center text-sm text-destructive">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          Noch keine Kommunikationseinträge angelegt.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          Keine Einträge für die gewählten Filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zielgruppe</TableHead>
                <TableHead>Botschaft</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Geplant</TableHead>
                <TableHead>Verantwortlich</TableHead>
                <TableHead>Freigeber</TableHead>
                <TableHead>Vertraulichkeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {targetGroupDisplay(e)}
                    {(e.phase_id || e.stage_gate_id) && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {e.phase_id ? phaseName.get(e.phase_id) : ""}
                        {e.phase_id && e.stage_gate_id ? " · " : ""}
                        {e.stage_gate_id ? gateLabel.get(e.stage_gate_id) : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    {/* PROJ-119 B2 — inner-circle bodies never travel with the
                        list; they are fetched through the logged endpoint. */}
                    {e.is_inner_circle ? (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {e.has_message
                          ? "Inhalt geschützt"
                          : "Kein Inhalt hinterlegt"}
                      </span>
                    ) : (
                      <span className="block truncate text-sm text-muted-foreground">
                        {e.message?.trim() || "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.channel?.trim() || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(e.planned_date)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.responsible_user_id
                      ? memberName.get(e.responsible_user_id) ??
                        e.responsible_user_id.slice(0, 8)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.approver_user_id
                      ? memberName.get(e.approver_user_id) ??
                        e.approver_user_id.slice(0, 8)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={levelBadgeVariant(e.confidentiality_level)}>
                        {MA_CONFIDENTIALITY_LEVEL_LABELS[e.confidentiality_level]}
                      </Badge>
                      {e.is_inner_circle && (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="h-3 w-3" aria-hidden /> Inner Circle
                        </Badge>
                      )}
                      {e.embargo_at && (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" aria-hidden />
                          {new Date(e.embargo_at) > new Date()
                            ? `Embargo bis ${fmtDate(e.embargo_at)}`
                            : "Embargo abgelaufen"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(e.approval_status)}>
                      {APPROVAL_STATUS_LABELS[e.approval_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Freigabe-Workflow"
                        onClick={() => setApprovalFor(e)}
                      >
                        <Send className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Vertraulichkeit und Zugriff"
                        onClick={() => setGovernanceFor(e)}
                      >
                        <Lock className="h-4 w-4" aria-hidden />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eintrag bearbeiten"
                            onClick={() => setDialog({ mode: "edit", entry: e })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eintrag löschen"
                            onClick={() => handleDelete(e)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog.mode !== "closed" && (
        <CommunicationEntryDialog
          open
          onOpenChange={(o) => !o && setDialog({ mode: "closed" })}
          projectId={projectId}
          entry={dialog.mode === "edit" ? dialog.entry : null}
          templates={templates}
          onSaved={async () => {
            setDialog({ mode: "closed" })
            await reload()
          }}
        />
      )}

      {approvalFor && (
        <ApprovalSheet
          projectId={projectId}
          entry={approvalFor}
          canManage={canManage}
          isApprover={
            Boolean(user?.id) && approvalFor.approver_user_id === user?.id
          }
          onClose={() => setApprovalFor(null)}
          onChanged={reload}
        />
      )}

      {governanceFor && (
        <CommunicationGovernanceSheet
          projectId={projectId}
          entry={governanceFor}
          canManage={canManage}
          isTenantAdmin={currentRole === "admin"}
          members={members.map((m) => ({
            user_id: m.user_id,
            name: m.display_name ?? m.email.split("@")[0] ?? "Mitglied",
          }))}
          onClose={() => setGovernanceFor(null)}
          onChanged={reload}
        />
      )}

      {templatesOpen && (
        <CommunicationTemplatesDialog
          projectId={projectId}
          canManage={canManage}
          onClose={() => setTemplatesOpen(false)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

/**
 * PROJ-119 B2/DoD — renders the body of an entry.
 *
 * For a normal entry the text already travelled with the list. For an
 * inner-circle entry it did not: revealing it is an explicit act that the
 * server records in the access log, so it sits behind a button that says so.
 */
function EntryMessage({
  projectId,
  entry,
}: {
  projectId: string
  entry: CommunicationEntry
}) {
  const [revealed, setRevealed] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  if (!entry.is_inner_circle) {
    if (!entry.message?.trim()) return null
    return (
      <div>
        <dt className="text-muted-foreground">Botschaft</dt>
        <dd className="whitespace-pre-wrap">{entry.message}</dd>
      </div>
    )
  }

  if (!entry.has_message) return null

  return (
    <div>
      <dt className="text-muted-foreground">Botschaft</dt>
      <dd>
        {revealed !== null ? (
          <span className="whitespace-pre-wrap">{revealed}</span>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Inhalt geschützt (Inner
              Circle)
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={async () => {
                setLoading(true)
                try {
                  setRevealed((await readEntryContent(projectId, entry.id)) ?? "")
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Zugriff verweigert."
                  )
                } finally {
                  setLoading(false)
                }
              }}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" aria-hidden />
              )}
              Inhalt anzeigen (wird protokolliert)
            </Button>
          </div>
        )}
      </dd>
    </div>
  )
}

function ApprovalSheet({
  projectId,
  entry,
  canManage,
  isApprover,
  onClose,
  onChanged,
}: {
  projectId: string
  entry: CommunicationEntry
  canManage: boolean
  isApprover: boolean
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const [busy, setBusy] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState("")
  const [showReject, setShowReject] = React.useState(false)

  const status = entry.approval_status

  async function wrap(fn: () => Promise<void>, okMsg: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(okMsg)
      await onChanged()
    } catch (err) {
      // SoD + state guards are enforced server-side; surface the message.
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" aria-hidden /> Freigabe-Workflow
          </SheetTitle>
          <SheetDescription>
            Einreichen → Freigeben/Ablehnen → Versendet. Der Freigeber muss vom
            Verantwortlichen abweichen (SoD, serverseitig erzwungen).
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Zielgruppe</dt>
              <dd className="font-medium">{targetGroupDisplay(entry)}</dd>
            </div>
            <EntryMessage projectId={projectId} entry={entry} />
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={statusBadgeVariant(status)}>
                  {APPROVAL_STATUS_LABELS[status]}
                </Badge>
              </dd>
            </div>
            {status === "rejected" && entry.rejection_reason && (
              <div>
                <dt className="text-muted-foreground">Ablehnungsgrund</dt>
                <dd className="text-destructive">{entry.rejection_reason}</dd>
              </div>
            )}
          </dl>

          <div className="space-y-2 border-t pt-4">
            {/* Submit — draft/rejected → pending (responsible/editor). */}
            {canManage && (status === "draft" || status === "rejected") && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() =>
                  wrap(async () => {
                    await submitEntry(projectId, entry.id)
                  }, "Zur Freigabe eingereicht.")
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Zur Freigabe einreichen
              </Button>
            )}

            {/* Respond — only the assigned approver, only while pending. */}
            {status === "pending_approval" && isApprover && (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    wrap(async () => {
                      await respondApproval(projectId, entry.id, { approved: true })
                    }, "Freigegeben.")
                  }
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Freigeben
                </Button>
                {!showReject ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setShowReject(true)}
                  >
                    Ablehnen
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-md border p-3">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ablehnungsgrund (erforderlich)"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || !rejectReason.trim()}
                        onClick={() =>
                          wrap(async () => {
                            await respondApproval(projectId, entry.id, {
                              approved: false,
                              reason: rejectReason.trim(),
                            })
                            setShowReject(false)
                            setRejectReason("")
                          }, "Abgelehnt.")
                        }
                      >
                        Ablehnung bestätigen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowReject(false)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {status === "pending_approval" && !isApprover && (
              <p className="text-sm text-muted-foreground">
                Wartet auf Freigabe durch den zugewiesenen Freigeber.
              </p>
            )}

            {/* Mark sent — approved → sent. */}
            {canManage && status === "approved" && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() =>
                  wrap(async () => {
                    await markSent(projectId, entry.id)
                  }, "Als versendet markiert.")
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Als versendet markieren
              </Button>
            )}

            {status === "sent" && (
              <p className="text-sm text-muted-foreground">
                Diese Kommunikation wurde als versendet markiert.
              </p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
