"use client"

import { AlertCircle, Loader2, ShieldAlert } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  submitAIReviewBatch,
  type AIReviewDecision,
  type AIReviewRunMetadata,
  type InteractionParticipant,
} from "@/lib/stakeholder-interactions/api"

import {
  ParticipantReviewCard,
  type CardDecision,
} from "./participant-review-card"

/**
 * PROJ-34-γ.2 — Right-side Sheet for reviewing per-participant AI sentiment
 * proposals.
 *
 * Reuses the Sheet pattern from `profile-edit-sheet.tsx` (PROJ-33). Decision
 * state lives locally; on Save the batch endpoint
 * `PATCH /api/projects/[id]/interactions/[iid]/ai-review` is hit once.
 *
 * Edge states (Designer §D matrix):
 *   - StubFallbackBanner when run was the local Stub (neutral 0/0 + 0.3 conf)
 *   - ExternalBlockedBanner when Class-3 blocked the run (no provider)
 *   - PerCard error border on save failure (re-try keeps local state)
 */

interface AIReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  interactionId: string
  interactionLabel: string
  participants: InteractionParticipant[]
  stakeholderLabels: Map<string, string>
  runMetadata?: AIReviewRunMetadata
  onSaved: () => void
}

export function AIReviewSheet(props: AIReviewSheetProps) {
  const { open } = props
  // Re-mount on open so we get a clean decision map each time.
  return (
    <Sheet open={open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {open ? <AIReviewSheetBody {...props} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function AIReviewSheetBody({
  onOpenChange,
  projectId,
  interactionId,
  interactionLabel,
  participants,
  stakeholderLabels,
  runMetadata,
  onSaved,
}: AIReviewSheetProps) {
  const aiParticipants = React.useMemo(
    () =>
      participants.filter(
        (p) =>
          p.participant_sentiment_source === "ai_proposed" ||
          p.participant_cooperation_signal_source === "ai_proposed",
      ),
    [participants],
  )
  const [decisions, setDecisions] = React.useState<Map<string, CardDecision>>(
    () =>
      new Map(
        aiParticipants.map((p) => [p.stakeholder_id, { kind: "open" } as const]),
      ),
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [confirmBulkAccept, setConfirmBulkAccept] = React.useState(false)

  const total = aiParticipants.length
  const decided = React.useMemo(
    () =>
      Array.from(decisions.values()).filter((d) => d.kind !== "open").length,
    [decisions],
  )
  const hasUnsaved = decided > 0
  const allDecided = total > 0 && decided === total

  const updateDecision = React.useCallback(
    (stakeholderId: string, next: CardDecision) => {
      setDecisions((prev) => {
        const out = new Map(prev)
        out.set(stakeholderId, next)
        return out
      })
    },
    [],
  )

  const bulk = (kind: "accept" | "reject") => {
    setDecisions((prev) => {
      const out = new Map(prev)
      for (const p of aiParticipants) {
        if ((prev.get(p.stakeholder_id)?.kind ?? "open") === "open") {
          out.set(p.stakeholder_id, { kind })
        }
      }
      return out
    })
  }

  const onBulkAccept = () => {
    if (total >= 5) {
      setConfirmBulkAccept(true)
      return
    }
    bulk("accept")
  }

  const onSave = async () => {
    setSubmitting(true)
    try {
      const batch: AIReviewDecision[] = []
      for (const p of aiParticipants) {
        const d = decisions.get(p.stakeholder_id)
        if (!d || d.kind === "open") continue
        if (d.kind === "accept") {
          batch.push({ stakeholder_id: p.stakeholder_id, decision: "accept" })
        } else if (d.kind === "reject") {
          batch.push({ stakeholder_id: p.stakeholder_id, decision: "reject" })
        } else {
          batch.push({
            stakeholder_id: p.stakeholder_id,
            decision: "modify",
            overrides: {
              sentiment: d.sentiment,
              cooperation: d.cooperation,
            },
          })
        }
      }
      if (batch.length === 0) {
        onOpenChange(false)
        return
      }
      await submitAIReviewBatch(projectId, interactionId, batch)
      toast.success(
        `${batch.length} KI-Vorschläge gespeichert.`,
      )
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onAttemptClose = (next: boolean) => {
    if (!next && hasUnsaved && !submitting) {
      setConfirmDiscard(true)
      return
    }
    onOpenChange(next)
  }

  const isStub =
    runMetadata?.provider?.toLowerCase().includes("stub") ?? false
  const isBlocked = runMetadata?.status === "external_blocked"
  const confidenceAvg = runMetadata?.confidence_avg
  const provider = runMetadata?.provider ?? "Stub"
  const model = runMetadata?.model ?? "neutral"

  const liveText =
    total === 0
      ? "Keine offenen KI-Vorschläge"
      : `${total - decided} KI-Vorschläge zu prüfen für ${total} Teilnehmer`

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>
      <SheetHeader className="space-y-2 border-b p-4">
        <SheetTitle>KI-Vorschlag prüfen</SheetTitle>
        <SheetDescription>{interactionLabel}</SheetDescription>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          ✦ {provider} · {model}
          {confidenceAvg != null
            ? ` · Konfidenz Ø ${Math.round(confidenceAvg * 100)}%`
            : ""}
        </p>
      </SheetHeader>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isBlocked ? (
          <Alert>
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>KI-Sentiment nicht verfügbar</AlertTitle>
            <AlertDescription>
              Keine kompatiblen AI-Provider hinterlegt. Tenant-Admins können
              Provider unter{" "}
              <a
                href="/settings/tenant/ai-providers"
                className="underline"
              >
                /settings/tenant/ai-providers
              </a>{" "}
              konfigurieren.
            </AlertDescription>
          </Alert>
        ) : null}
        {isStub ? (
          <Alert>
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Lokaler Stub-Vorschlag</AlertTitle>
            <AlertDescription>
              Kein KI-Provider verfügbar — neutrale Platzhalter wurden
              eingetragen. Bitte manuell bewerten oder ablehnen.
            </AlertDescription>
          </Alert>
        ) : null}

        {aiParticipants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine offenen KI-Vorschläge auf dieser Interaktion.
          </p>
        ) : (
          aiParticipants.map((p, idx) => (
            <ParticipantReviewCard
              key={p.stakeholder_id}
              participant={p}
              stakeholderName={
                stakeholderLabels.get(p.stakeholder_id) ?? "Stakeholder"
              }
              decision={decisions.get(p.stakeholder_id) ?? { kind: "open" }}
              onChange={(d) => updateDecision(p.stakeholder_id, d)}
              collapsedByDefault={idx >= 3}
            />
          ))
        )}
      </div>

      <SheetFooter className="flex flex-col gap-2 border-t bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {decided} von {total} entschieden
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onBulkAccept}
            disabled={submitting || total === 0 || allDecided}
          >
            Alle übernehmen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => bulk("reject")}
            disabled={submitting || total === 0 || allDecided}
          >
            Alle ablehnen
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onAttemptClose(false)}
            disabled={submitting}
          >
            Schließen
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={submitting || decided === 0}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Speichern{decided > 0 ? ` (${decided})` : ""}
          </Button>
        </div>
      </SheetFooter>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ungespeicherte Entscheidungen verwerfen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decided} Entscheidung{decided === 1 ? "" : "en"} gehen verloren,
              wenn du das Sheet schließt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false)
                onOpenChange(false)
              }}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmBulkAccept}
        onOpenChange={setConfirmBulkAccept}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle KI-Vorschläge übernehmen?</AlertDialogTitle>
            <AlertDialogDescription>
              {total} Vorschläge werden als manuell-bestätigt markiert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBulkAccept(false)
                bulk("accept")
              }}
            >
              Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
