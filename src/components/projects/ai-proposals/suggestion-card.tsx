"use client"

import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  PencilLine,
  Sparkles,
  X,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  acceptSuggestion,
  editSuggestionPayload,
  rejectSuggestion,
} from "@/lib/ki/api"
import type { KiRiskSuggestionPayload, KiSuggestion } from "@/types/ki"

import { SuggestionEditForm } from "./suggestion-edit-form"

interface SuggestionCardProps {
  suggestion: KiSuggestion
  onMutated: () => void
}

function scoreTone(score: number): string {
  if (score >= 16)
    return "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100"
  if (score >= 9)
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
  if (score >= 4)
    return "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
  return "bg-muted text-muted-foreground"
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SuggestionCard({ suggestion, onMutated }: SuggestionCardProps) {
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [showOriginal, setShowOriginal] = React.useState(false)
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState("")

  const payload = suggestion.payload
  const score = (payload.probability || 0) * (payload.impact || 0)

  const onAccept = async () => {
    setBusy(true)
    try {
      await acceptSuggestion(suggestion.id)
      toast.success("Risiko aus KI-Vorschlag angelegt", {
        description: payload.title,
      })
      onMutated()
    } catch (err) {
      toast.error("Akzeptieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const onReject = async () => {
    setBusy(true)
    try {
      await rejectSuggestion(suggestion.id, reason.trim() || undefined)
      toast.success("Vorschlag abgelehnt")
      setRejecting(false)
      setReason("")
      onMutated()
    } catch (err) {
      toast.error("Ablehnen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const onSaveEdit = async (next: KiRiskSuggestionPayload) => {
    setBusy(true)
    try {
      await editSuggestionPayload(suggestion.id, next)
      toast.success("Vorschlag aktualisiert")
      setEditing(false)
      onMutated()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const isDraft = suggestion.status === "draft"
  const isAccepted = suggestion.status === "accepted"
  const isRejected = suggestion.status === "rejected"

  return (
    <Card
      className={cn(
        isAccepted && "opacity-90",
        isRejected && "opacity-60"
      )}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles
              className="h-4 w-4 shrink-0 text-primary"
              aria-hidden
            />
            <h3 className="text-base font-semibold">{payload.title}</h3>
            {suggestion.is_modified && isDraft ? (
              <Badge variant="outline" className="text-xs">
                bearbeitet
              </Badge>
            ) : null}
            {isAccepted ? (
              <Badge variant="secondary" className="text-xs">
                übernommen
              </Badge>
            ) : null}
            {isRejected ? (
              <Badge variant="outline" className="text-xs">
                abgelehnt
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex h-6 min-w-[2.4rem] items-center justify-center rounded-md px-2 font-mono",
                scoreTone(score)
              )}
              title="Score"
            >
              {score}
            </span>
            <span className="hidden sm:inline">
              {formatDate(suggestion.created_at)}
            </span>
          </div>
        </div>

        {editing && isDraft ? (
          <SuggestionEditForm
            initial={payload}
            saving={busy}
            onCancel={() => setEditing(false)}
            onSave={onSaveEdit}
          />
        ) : (
          <>
            {payload.description ? (
              <p className="whitespace-pre-wrap text-sm">{payload.description}</p>
            ) : null}
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <span>
                Wahrsch.{" "}
                <span className="font-mono">{payload.probability}</span>
              </span>
              <span>
                Auswirk. <span className="font-mono">{payload.impact}</span>
              </span>
              <span>
                Status: <span className="font-medium">{payload.status}</span>
              </span>
            </div>
            {payload.mitigation ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Minderungsmaßnahme
                </p>
                <p className="whitespace-pre-wrap text-sm">{payload.mitigation}</p>
              </div>
            ) : null}

            {suggestion.is_modified ? (
              <Collapsible
                open={showOriginal}
                onOpenChange={setShowOriginal}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    {showOriginal ? (
                      <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ChevronRight className="mr-1 h-3.5 w-3.5" aria-hidden />
                    )}
                    KI-Originalfassung anzeigen
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="rounded-md border border-l-4 border-l-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                      <Bot className="h-3 w-3" aria-hidden /> Original (KI)
                    </div>
                    <p className="font-medium">
                      {suggestion.original_payload.title}
                    </p>
                    {suggestion.original_payload.description ? (
                      <p className="mt-1 whitespace-pre-wrap">
                        {suggestion.original_payload.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-muted-foreground">
                      P={suggestion.original_payload.probability} · A=
                      {suggestion.original_payload.impact}
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}

        {isRejected && suggestion.rejection_reason ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <p className="font-medium text-muted-foreground">
              Begründung Ablehnung
            </p>
            <p>{suggestion.rejection_reason}</p>
          </div>
        ) : null}

        {isDraft && !editing && !rejecting ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={() => void onAccept()}
              disabled={busy}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Übernehmen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              <PencilLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Bearbeiten
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(true)}
              disabled={busy}
            >
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Ablehnen
            </Button>
          </div>
        ) : null}

        {isDraft && rejecting ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <label
              htmlFor={`reject-reason-${suggestion.id}`}
              className="text-xs font-medium"
            >
              Begründung (optional)
            </label>
            <textarea
              id={`reject-reason-${suggestion.id}`}
              rows={2}
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Warum wird der Vorschlag verworfen?"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejecting(false)
                  setReason("")
                }}
                disabled={busy}
              >
                Zurück
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void onReject()}
                disabled={busy}
              >
                Ablehnen bestätigen
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
