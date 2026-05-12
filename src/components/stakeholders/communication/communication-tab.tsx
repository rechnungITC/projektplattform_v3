"use client"

import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  listInteractions,
  updateParticipantSignal,
  type InteractionParticipant,
  type StakeholderInteraction,
} from "@/lib/stakeholder-interactions/api"

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

export function CommunicationTab({
  projectId,
  stakeholderId,
}: CommunicationTabProps) {
  const [interactions, setInteractions] = React.useState<
    StakeholderInteraction[] | null
  >(null)
  const [reloadTick, setReloadTick] = React.useState(0)
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
      <AddInteractionForm
        projectId={projectId}
        stakeholderId={stakeholderId}
        onCreated={onCreated}
      />
      <InteractionList
        projectId={projectId}
        stakeholderId={stakeholderId}
        interactions={interactions ?? []}
        onDelete={onDelete}
        onSignalsChanged={onCreated}
      />
    </div>
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
  const [submitting, setSubmitting] = React.useState(false)

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
      })
      toast.success("Interaktion erfasst.")
      setSummary("")
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
  onDelete,
  onSignalsChanged,
}: {
  projectId: string
  stakeholderId: string
  interactions: StakeholderInteraction[]
  onDelete: (id: string) => void
  onSignalsChanged: () => void
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
          onDelete={onDelete}
          onSignalsChanged={onSignalsChanged}
        />
      ))}
    </div>
  )
}

function InteractionItem({
  projectId,
  stakeholderId,
  interaction,
  onDelete,
  onSignalsChanged,
}: {
  projectId: string
  stakeholderId: string
  interaction: StakeholderInteraction
  onDelete: (id: string) => void
  onSignalsChanged: () => void
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
            {interaction.participants.length > 1 ? (
              <Badge variant="outline">
                {interaction.participants.length} Teilnehmer
              </Badge>
            ) : null}
            {interaction.awaiting_response ? (
              <Badge variant="destructive">Antwort offen</Badge>
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
        {focusedParticipant ? (
          <ParticipantSignalRow
            projectId={projectId}
            interactionId={interaction.id}
            participant={focusedParticipant}
            onChanged={onSignalsChanged}
          />
        ) : null}
      </CardContent>
    </Card>
  )
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
