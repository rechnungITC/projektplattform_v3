"use client"

import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      <InteractionList interactions={interactions ?? []} onDelete={onDelete} />
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
  interactions,
  onDelete,
}: {
  interactions: StakeholderInteraction[]
  onDelete: (id: string) => void
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
        <InteractionItem key={it.id} interaction={it} onDelete={onDelete} />
      ))}
    </div>
  )
}

function InteractionItem({
  interaction,
  onDelete,
}: {
  interaction: StakeholderInteraction
  onDelete: (id: string) => void
}) {
  const date = new Date(interaction.interaction_date)
  const dateLabel = date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
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
      </CardContent>
    </Card>
  )
}
