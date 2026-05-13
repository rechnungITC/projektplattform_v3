"use client"

import {
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquarePlus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  createInteraction,
  deleteInteraction,
  listAwaitingInteractions,
  listInteractions,
  triggerSentimentReview,
  updateInteraction,
  updateParticipantSignal,
  type AIReviewRunMetadata,
  type AwaitingInteraction,
  type InteractionParticipant,
  type StakeholderInteraction,
} from "@/lib/stakeholder-interactions/api"
import { listStakeholders } from "@/lib/stakeholders/api"

import { AIProposalPill } from "./ai-proposal-pill"
import { AIReviewSheet } from "./ai-review-sheet"
import { ParticipantPillsStrip } from "./participant-pills-strip"

/**
 * PROJ-34-α — Kommunikations-Tab im Stakeholder-Detail-Drawer.
 *
 * Read + Create + Soft-Delete fuer Interactions. Per-Participant-
 * Sentiment-/Cooperation-Spalten existieren auf der Bridge (CIA-L3),
 * werden in alpha aber noch nicht editierbar gemacht — das ist die
 * Aufgabe von 34-β (manuelle Slider) und 34-γ (AI-Vorschlag).
 */

interface CommunicationTabProps {
  projectId: string
  stakeholderId: string
}

const CHANNEL_LABELS: Record<StakeholderInteraction["channel"], string> = {
  email: "E-Mail",
  meeting: "Meeting",
  chat: "Chat",
  phone: "Telefon",
  other: "Sonstiges",
}

const DIRECTION_LABELS: Record<StakeholderInteraction["direction"], string> = {
  inbound: "Eingehend",
  outbound: "Ausgehend",
  bidirectional: "Bidirektional",
}

const EXTERNAL_BLOCKED_LS_KEY = (projectId: string) =>
  `proj34:external_blocked:${projectId}`

function readExternalBlocked(projectId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(EXTERNAL_BLOCKED_LS_KEY(projectId)) === "1"
  } catch {
    return false
  }
}

function writeExternalBlocked(projectId: string, value: boolean) {
  if (typeof window === "undefined") return
  try {
    if (value) {
      window.localStorage.setItem(EXTERNAL_BLOCKED_LS_KEY(projectId), "1")
    } else {
      window.localStorage.removeItem(EXTERNAL_BLOCKED_LS_KEY(projectId))
    }
  } catch {
    // localStorage may be disabled; banner just becomes session-scoped.
  }
}

export function CommunicationTab({
  projectId,
  stakeholderId,
}: CommunicationTabProps) {
  const [interactions, setInteractions] = React.useState<
    StakeholderInteraction[] | null
  >(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  // Stakeholder-name lookup so multi-participant rows can render names.
  // Loaded once per project; refreshed only when projectId changes.
  const [stakeholderLabels, setStakeholderLabels] = React.useState<
    Map<string, string>
  >(new Map())
  // PROJ-34-γ.2 F-2 — persistent external_blocked banner. Initialised from
  // localStorage via a lazy state initializer (SSR-safe — readExternal-
  // Blocked short-circuits when window is undefined). projectId does not
  // change during this component's lifetime (page-route param), so we do
  // not need to re-derive on prop change.
  const [externalBlocked, setExternalBlocked] = React.useState<boolean>(() =>
    readExternalBlocked(projectId),
  )
  const onExternalBlocked = React.useCallback(() => {
    setExternalBlocked(true)
    writeExternalBlocked(projectId, true)
  }, [projectId])
  const onDismissExternalBlocked = React.useCallback(() => {
    setExternalBlocked(false)
    writeExternalBlocked(projectId, false)
  }, [projectId])
  // PROJ-34-γ.2 F-3 — gate the AI-Pill + trigger button on edit role.
  const canEdit = useProjectAccess(projectId, "edit_master")
  // `loading` derived from `interactions === null` (first load) avoids
  // the React Compiler warning about synchronous setState inside the
  // effect. Subsequent reloads keep stale data visible.
  const loading = interactions === null

  React.useEffect(() => {
    let cancelled = false
    listInteractions(projectId, stakeholderId)
      .then((rows) => {
        if (!cancelled) setInteractions(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error("Interaktionen konnten nicht geladen werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          setInteractions([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId, stakeholderId, reloadTick])

  React.useEffect(() => {
    let cancelled = false
    listStakeholders(projectId)
      .then((rows) => {
        if (cancelled) return
        setStakeholderLabels(
          new Map(rows.map((s) => [s.id, s.name])),
        )
      })
      .catch(() => {
        // Fail-soft: name lookup is non-critical, fallback to "Stakeholder".
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const onCreated = React.useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  const onDelete = React.useCallback(
    async (interactionId: string) => {
      if (
        !window.confirm(
          "Diese Interaktion wirklich löschen? Soft-Delete — DSGVO-Hard-Delete folgt separat.",
        )
      ) {
        return
      }
      try {
        await deleteInteraction(projectId, interactionId)
        toast.success("Interaktion gelöscht.")
        setReloadTick((t) => t + 1)
      } catch (err) {
        toast.error("Löschen fehlgeschlagen", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    },
    [projectId],
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AwaitingResponsesSection
        projectId={projectId}
        stakeholderId={stakeholderId}
        reloadTick={reloadTick}
        onChanged={onCreated}
      />
      {externalBlocked ? (
        <Alert className="relative pr-10">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>KI-Sentiment nicht verfügbar</AlertTitle>
          <AlertDescription>
            Für diesen Mandanten sind keine kompatiblen AI-Provider
            hinterlegt — Stimmungs-/Kooperations-Werte können weiterhin
            manuell erfasst werden. Tenant-Admin:{" "}
            <a
              href="/settings/tenant/ai-providers"
              className="underline"
            >
              /settings/tenant/ai-providers
            </a>
            .
          </AlertDescription>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onDismissExternalBlocked}
            aria-label="Hinweis schließen"
            className="absolute right-2 top-2 h-6 w-6"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </Alert>
      ) : null}
      <AddInteractionForm
        projectId={projectId}
        stakeholderId={stakeholderId}
        onCreated={onCreated}
      />
      <InteractionList
        projectId={projectId}
        stakeholderId={stakeholderId}
        interactions={interactions ?? []}
        stakeholderLabels={stakeholderLabels}
        canEdit={canEdit}
        onDelete={onDelete}
        onSignalsChanged={onCreated}
        onExternalBlocked={onExternalBlocked}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PROJ-34-δ — Offene Antworten + Overdue-Badge + Quick-Action
// ---------------------------------------------------------------------------

function AwaitingResponsesSection({
  projectId,
  stakeholderId,
  reloadTick,
  onChanged,
}: {
  projectId: string
  stakeholderId: string
  reloadTick: number
  onChanged: () => void
}) {
  const [rows, setRows] = React.useState<AwaitingInteraction[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    listAwaitingInteractions(projectId, stakeholderId)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((err) => {
        if (!cancelled) {
          // Fail-soft: hide the section if the endpoint errors.
          toast.error("Offene Antworten konnten nicht geladen werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          setRows([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId, stakeholderId, reloadTick])

  if (rows == null) return null
  if (rows.length === 0) return null

  const overdueCount = rows.filter((r) => r.is_overdue).length

  const markResponded = async (id: string) => {
    try {
      await updateInteraction(projectId, id, {
        awaiting_response: false,
        response_received_date: new Date().toISOString(),
      })
      toast.success("Als beantwortet markiert.")
      onChanged()
    } catch (err) {
      toast.error("Update fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" aria-hidden /> Offene Antworten
          <Badge variant="outline" className="ml-1 text-[10px]">
            {rows.length}
          </Badge>
          {overdueCount > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              {overdueCount} überfällig
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const dueLabel = row.response_due_date
            ? new Date(row.response_due_date).toLocaleDateString("de-DE")
            : "(kein Fälligkeitsdatum)"
          return (
            <div
              key={row.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                row.is_overdue
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-border"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate">{row.summary}</p>
                <p className="text-[11px] text-muted-foreground">
                  Fällig: {dueLabel}{" "}
                  {row.is_overdue ? (
                    <span className="font-medium text-red-600">
                      · überfällig
                    </span>
                  ) : null}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => markResponded(row.id)}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                Antwort erhalten
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Inline-Add-Form
// ---------------------------------------------------------------------------

function AddInteractionForm({
  projectId,
  stakeholderId,
  onCreated,
}: {
  projectId: string
  stakeholderId: string
  onCreated: () => void
}) {
  const [channel, setChannel] =
    React.useState<StakeholderInteraction["channel"]>("email")
  const [direction, setDirection] =
    React.useState<StakeholderInteraction["direction"]>("outbound")
  const [interactionDate, setInteractionDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 16),
  )
  const [summary, setSummary] = React.useState("")
  // PROJ-34-δ — only outbound interactions can plausibly await a reply.
  // The form hides these inputs for non-outbound directions but the
  // backend also enforces consistency on commit.
  const [awaitingResponse, setAwaitingResponse] = React.useState(false)
  const [responseDueDate, setResponseDueDate] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)

  const canAwaitResponse = direction === "outbound"

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (summary.trim().length === 0) {
      toast.error("Bitte eine Zusammenfassung eingeben.")
      return
    }
    setSubmitting(true)
    try {
      await createInteraction(projectId, stakeholderId, {
        channel,
        direction,
        interaction_date: new Date(interactionDate).toISOString(),
        summary: summary.trim(),
        awaiting_response: canAwaitResponse ? awaitingResponse : false,
        response_due_date:
          canAwaitResponse && awaitingResponse && responseDueDate.length > 0
            ? responseDueDate
            : null,
      })
      toast.success("Interaktion erfasst.")
      setSummary("")
      setAwaitingResponse(false)
      setResponseDueDate("")
      onCreated()
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Neue Interaktion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="interaction-channel">Kanal</Label>
              <Select
                value={channel}
                onValueChange={(v) =>
                  setChannel(v as StakeholderInteraction["channel"])
                }
              >
                <SelectTrigger id="interaction-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABELS) as Array<keyof typeof CHANNEL_LABELS>).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {CHANNEL_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="interaction-direction">Richtung</Label>
              <Select
                value={direction}
                onValueChange={(v) =>
                  setDirection(v as StakeholderInteraction["direction"])
                }
              >
                <SelectTrigger id="interaction-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(DIRECTION_LABELS) as Array<
                      keyof typeof DIRECTION_LABELS
                    >
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DIRECTION_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="interaction-date">Zeitpunkt</Label>
              <Input
                id="interaction-date"
                type="datetime-local"
                value={interactionDate}
                onChange={(e) => setInteractionDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="interaction-summary">
              Zusammenfassung
              <span className="ml-1 text-xs text-muted-foreground">
                ({summary.length} / 500)
              </span>
            </Label>
            <Textarea
              id="interaction-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={500}
              placeholder="Worüber wurde gesprochen? Keine personenbezogenen Roh-Inhalte ablegen."
              required
              rows={3}
            />
          </div>
          {canAwaitResponse ? (
            <div className="flex flex-wrap items-end gap-3">
              <Label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={awaitingResponse}
                  onCheckedChange={(v) => setAwaitingResponse(v === true)}
                />
                Antwort erwartet
              </Label>
              {awaitingResponse ? (
                <div>
                  <Label htmlFor="response-due-date" className="text-xs">
                    Fällig am
                  </Label>
                  <Input
                    id="response-due-date"
                    type="date"
                    value={responseDueDate}
                    onChange={(e) => setResponseDueDate(e.target.value)}
                    className="h-8 w-auto text-xs"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Erfassen
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Interaction-List
// ---------------------------------------------------------------------------

function InteractionList({
  projectId,
  stakeholderId,
  interactions,
  stakeholderLabels,
  canEdit,
  onDelete,
  onSignalsChanged,
  onExternalBlocked,
}: {
  projectId: string
  stakeholderId: string
  interactions: StakeholderInteraction[]
  stakeholderLabels: Map<string, string>
  canEdit: boolean
  onDelete: (id: string) => void
  onSignalsChanged: () => void
  onExternalBlocked: () => void
}) {
  if (interactions.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        Noch keine Interaktionen erfasst.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {interactions.map((it) => (
        <InteractionItem
          key={it.id}
          projectId={projectId}
          stakeholderId={stakeholderId}
          interaction={it}
          stakeholderLabels={stakeholderLabels}
          canEdit={canEdit}
          onDelete={onDelete}
          onSignalsChanged={onSignalsChanged}
          onExternalBlocked={onExternalBlocked}
        />
      ))}
    </div>
  )
}

function InteractionItem({
  projectId,
  stakeholderId,
  interaction,
  stakeholderLabels,
  canEdit,
  onDelete,
  onSignalsChanged,
  onExternalBlocked,
}: {
  projectId: string
  stakeholderId: string
  interaction: StakeholderInteraction
  stakeholderLabels: Map<string, string>
  canEdit: boolean
  onDelete: (id: string) => void
  onSignalsChanged: () => void
  onExternalBlocked: () => void
}) {
  const date = new Date(interaction.interaction_date)
  const dateLabel = date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
  // PROJ-34-β — the focused stakeholder's own participation row carries
  // the editable signals for THIS detail view. Other participants are
  // shown read-only as count + aggregate pills.
  const focusedParticipant = interaction.participants.find(
    (p) => p.stakeholder_id === stakeholderId,
  )
  const isMultiParticipant = interaction.participants.length > 1

  // PROJ-34-γ.2 — AI-Pill state. Transient request state ("loading"/
  // "failed") layers on top of the derived variant; on every participant
  // refresh the derived variant wins again.
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [requestState, setRequestState] = React.useState<
    "idle" | "loading" | "failed"
  >("idle")
  const [runMetadata, setRunMetadata] = React.useState<
    AIReviewRunMetadata | undefined
  >(undefined)
  const derivedVariant = React.useMemo(
    () => derivePillVariant(interaction.participants),
    [interaction.participants],
  )
  const pillVariant: "proposed" | "stub" | "loading" | "failed" | "hidden" =
    requestState === "loading"
      ? "loading"
      : requestState === "failed"
        ? "failed"
        : derivedVariant

  const pendingCount = React.useMemo(
    () =>
      interaction.participants.filter(
        (p) =>
          p.participant_sentiment_source === "ai_proposed" ||
          p.participant_cooperation_signal_source === "ai_proposed",
      ).length,
    [interaction.participants],
  )

  const hasAnyAIRows = interaction.participants.some(
    (p) =>
      p.participant_sentiment_source?.startsWith("ai_") ||
      p.participant_cooperation_signal_source?.startsWith("ai_"),
  )

  const onTrigger = async () => {
    setRequestState("loading")
    try {
      const meta = await triggerSentimentReview(projectId, interaction.id)
      setRunMetadata(meta)
      if (meta.status === "external_blocked") {
        // F-2: surface a persistent tab-level banner so the user does not
        // lose the information after the toast disappears.
        onExternalBlocked()
        toast.info("KI-Sentiment nicht verfügbar", {
          description:
            "Kein kompatibler AI-Provider hinterlegt. Werte können manuell gesetzt werden.",
        })
        setRequestState("idle")
        return
      }
      setRequestState("idle")
      onSignalsChanged()
    } catch (err) {
      toast.error("KI-Vorschlag fehlgeschlagen", {
        description:
          err instanceof Error
            ? err.message
            : "Werte können manuell gesetzt werden.",
      })
      setRequestState("failed")
    }
  }

  const interactionLabel = `${CHANNEL_LABELS[interaction.channel]} · ${dateLabel} · ${interaction.participants.length} Teilnehmer`

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{CHANNEL_LABELS[interaction.channel]}</Badge>
            <Badge variant="secondary">
              {DIRECTION_LABELS[interaction.direction]}
            </Badge>
            <span className="text-xs text-muted-foreground">{dateLabel}</span>
            {isMultiParticipant ? (
              <Badge variant="outline">
                {interaction.participants.length} Teilnehmer
              </Badge>
            ) : null}
            {interaction.awaiting_response ? (
              <Badge variant="destructive">Antwort offen</Badge>
            ) : null}
            {pillVariant !== "hidden" ? (
              <AIProposalPill
                variant={pillVariant}
                pendingCount={pendingCount}
                onClick={() => setReviewOpen(true)}
                onRetry={onTrigger}
                disabled={!canEdit}
              />
            ) : null}
            {!hasAnyAIRows && pillVariant === "hidden" && canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={onTrigger}
                aria-label="KI-Sentiment-Analyse anfragen"
              >
                ✦ KI-Analyse anfragen
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(interaction.id)}
            aria-label="Interaktion löschen"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <p className="text-sm whitespace-pre-wrap">{interaction.summary}</p>

        {isMultiParticipant ? (
          <ParticipantPillsStrip
            participants={interaction.participants}
            stakeholderLabels={stakeholderLabels}
          />
        ) : focusedParticipant ? (
          <ParticipantSignalRow
            projectId={projectId}
            interactionId={interaction.id}
            participant={focusedParticipant}
            onChanged={onSignalsChanged}
          />
        ) : null}
      </CardContent>

      <AIReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        projectId={projectId}
        interactionId={interaction.id}
        interactionLabel={interactionLabel}
        participants={interaction.participants}
        stakeholderLabels={stakeholderLabels}
        runMetadata={runMetadata}
        onSaved={onSignalsChanged}
      />
    </Card>
  )
}

/**
 * Decides the AI-Pill variant from the participant rows. Returns "hidden" if
 * no AI proposal is pending and no decision marker is on the rows.
 */
function derivePillVariant(
  participants: readonly InteractionParticipant[],
): "proposed" | "stub" | "loading" | "failed" | "hidden" {
  const pendingRow = participants.find(
    (p) =>
      p.participant_sentiment_source === "ai_proposed" ||
      p.participant_cooperation_signal_source === "ai_proposed",
  )
  if (!pendingRow) return "hidden"
  const provider = pendingRow.participant_sentiment_provider ?? null
  if (provider && provider.toLowerCase().includes("stub")) return "stub"
  return "proposed"
}

// ---------------------------------------------------------------------------
// PROJ-34-β — Per-Participant Signal Pills + Edit Dialog
// ---------------------------------------------------------------------------

const SIGNAL_PILL_TONE: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
  [-1]: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  0: "bg-muted text-muted-foreground border-muted-foreground/20",
  1: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  2: "bg-emerald-600/20 text-emerald-800 border-emerald-600/40 dark:text-emerald-200",
}

const SENTIMENT_LABELS: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "Stark negativ",
  [-1]: "Negativ",
  0: "Neutral",
  1: "Positiv",
  2: "Stark positiv",
}

const COOPERATION_LABELS: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "Obstruktiv",
  [-1]: "Skeptisch",
  0: "Neutral",
  1: "Kooperativ",
  2: "Sehr kooperativ",
}

function signalPill(
  label: string,
  value: number | null,
  source: InteractionParticipant["participant_sentiment_source"] | null,
  valueLabels: Record<-2 | -1 | 0 | 1 | 2, string>,
): React.ReactNode {
  if (value == null) {
    return (
      <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground">
        {label}: —
      </span>
    )
  }
  const tone = SIGNAL_PILL_TONE[value as -2 | -1 | 0 | 1 | 2]
  const aiHint =
    source === "ai_proposed"
      ? " (KI-Vorschlag)"
      : source === "ai_accepted"
        ? " (KI ✓)"
        : ""
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>
      {label}: {valueLabels[value as -2 | -1 | 0 | 1 | 2]}
      {aiHint}
    </span>
  )
}

function ParticipantSignalRow({
  projectId,
  interactionId,
  participant,
  onChanged,
}: {
  projectId: string
  interactionId: string
  participant: InteractionParticipant
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Wahrnehmung:
      </span>
      {signalPill(
        "Stimmung",
        participant.participant_sentiment,
        participant.participant_sentiment_source,
        SENTIMENT_LABELS,
      )}
      {signalPill(
        "Kooperation",
        participant.participant_cooperation_signal,
        participant.participant_cooperation_signal_source,
        COOPERATION_LABELS,
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px]"
        onClick={() => setOpen(true)}
      >
        Bewerten
      </Button>
      <SignalEditDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        interactionId={interactionId}
        participant={participant}
        onChanged={() => {
          setOpen(false)
          onChanged()
        }}
      />
    </div>
  )
}

function SignalEditDialog({
  open,
  onOpenChange,
  projectId,
  interactionId,
  participant,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  interactionId: string
  participant: InteractionParticipant
  onChanged: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <SignalEditDialogBody
            projectId={projectId}
            interactionId={interactionId}
            participant={participant}
            onCancel={() => onOpenChange(false)}
            onChanged={onChanged}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SignalEditDialogBody({
  projectId,
  interactionId,
  participant,
  onCancel,
  onChanged,
}: {
  projectId: string
  interactionId: string
  participant: InteractionParticipant
  onCancel: () => void
  onChanged: () => void
}) {
  // Body re-mounts each time the dialog opens, so naive useState
  // initialisation from props is correct here — no setState-in-effect
  // needed.
  const [sentiment, setSentiment] = React.useState<number | null>(
    participant.participant_sentiment,
  )
  const [cooperation, setCooperation] = React.useState<number | null>(
    participant.participant_cooperation_signal,
  )
  const [submitting, setSubmitting] = React.useState(false)

  const save = async () => {
    setSubmitting(true)
    try {
      await updateParticipantSignal(
        projectId,
        interactionId,
        participant.stakeholder_id,
        {
          participant_sentiment: sentiment,
          participant_cooperation_signal: cooperation,
        },
      )
      toast.success("Bewertung gespeichert.")
      onChanged()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const clear = async () => {
    setSubmitting(true)
    try {
      await updateParticipantSignal(
        projectId,
        interactionId,
        participant.stakeholder_id,
        {
          participant_sentiment: null,
          participant_cooperation_signal: null,
        },
      )
      toast.success("Bewertung gelöscht.")
      onChanged()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bewertung dieser Interaktion</DialogTitle>
        <DialogDescription>
          Sentiment (−2 … +2) und Kooperationssignal (−2 … +2) für diesen
          Stakeholder. Manuell gesetzte Werte überschreiben spätere
          KI-Vorschläge nicht automatisch.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <SignalSlider
          label="Stimmung (Sentiment)"
          value={sentiment}
          onChange={setSentiment}
          valueLabels={SENTIMENT_LABELS}
        />
        <SignalSlider
          label="Kooperation"
          value={cooperation}
          onChange={setCooperation}
          valueLabels={COOPERATION_LABELS}
        />
      </div>
      <DialogFooter className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={clear}
          disabled={submitting}
        >
          Zurücksetzen
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={save} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Speichern
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function SignalSlider({
  label,
  value,
  onChange,
  valueLabels,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  valueLabels: Record<-2 | -1 | 0 | 1 | 2, string>
}) {
  const buttons = [-2, -1, 0, 1, 2] as const
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {buttons.map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={value === v ? "default" : "outline"}
            onClick={() => onChange(v)}
            className="text-xs"
          >
            {v > 0 ? `+${v}` : v} · {valueLabels[v]}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {value == null ? "(noch nicht bewertet)" : valueLabels[value as -2 | -1 | 0 | 1 | 2]}
      </p>
    </div>
  )
}
