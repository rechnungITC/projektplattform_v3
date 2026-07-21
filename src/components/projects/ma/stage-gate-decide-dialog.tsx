"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { decideStageGate } from "@/lib/ma-project/stage-gates-api"
import type {
  StageGate,
  StageGateDecision,
} from "@/lib/ma-project/stage-gates-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

const DECISION_OPTIONS: {
  value: StageGateDecision
  label: string
  hint: string
}[] = [
  {
    value: "freigabe",
    label: "Freigabe",
    hint: "Nächste Phase wird aktiviert.",
  },
  {
    value: "auflage",
    label: "Auflage (bedingte Freigabe)",
    hint: "Nächste Phase wird aktiviert, mit dokumentierten Pflichten.",
  },
  {
    value: "abbruch",
    label: "Abbruch",
    hint: "Projekt wird beendet. Begründung ist Pflicht.",
  },
]

const CONFIDENTIALITY_OPTIONS: {
  value: MaConfidentialityLevel
  label: string
}[] = [
  { value: "standard", label: "Standard" },
  { value: "confidential", label: "Vertraulich" },
  { value: "strict", label: "Streng vertraulich" },
]

interface StageGateDecideDialogProps {
  projectId: string
  gate: StageGate | null
  onClose: () => void
  onDecided: () => void
}

// Outer shell owns open/close; the inner form is keyed by gate id so it
// remounts with fresh `useState` initializers for each gate — no reset effect
// (avoids the react-hooks/set-state-in-effect rule).
export function StageGateDecideDialog({
  projectId,
  gate,
  onClose,
  onDecided,
}: StageGateDecideDialogProps) {
  return (
    <Dialog open={gate !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {gate && (
          <DecideForm
            key={gate.id}
            projectId={projectId}
            gate={gate}
            onClose={onClose}
            onDecided={onDecided}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DecideForm({
  projectId,
  gate,
  onClose,
  onDecided,
}: {
  projectId: string
  gate: StageGate
  onClose: () => void
  onDecided: () => void
}) {
  const [decision, setDecision] = React.useState<StageGateDecision>("freigabe")
  const [reason, setReason] = React.useState("")
  const [conditions, setConditions] = React.useState("")
  const [confidentiality, setConfidentiality] =
    React.useState<MaConfidentialityLevel>(gate.confidentiality_level)
  const [submitting, setSubmitting] = React.useState(false)

  const abortNeedsReason = decision === "abbruch" && reason.trim().length === 0

  async function handleSubmit() {
    if (abortNeedsReason) return
    setSubmitting(true)
    try {
      await decideStageGate(projectId, gate.id, {
        decision,
        reason: reason.trim() || null,
        conditions: conditions.trim() || null,
        confidentiality_level: confidentiality,
      })
      toast.success(
        decision === "abbruch"
          ? "Gate abgebrochen – Projekt beendet."
          : "Gate entschieden – nächste Phase aktiviert."
      )
      onDecided()
      onClose()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Entscheidung fehlgeschlagen."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gate entscheiden</DialogTitle>
        <DialogDescription>
          {gate.label} — die Entscheidung erzeugt einen unveränderbaren Eintrag
          im Entscheidungslog.
        </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Entscheidung</Label>
            <RadioGroup
              value={decision}
              onValueChange={(v) => setDecision(v as StageGateDecision)}
              className="gap-2"
            >
              {DECISION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`decision-${opt.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                >
                  <RadioGroupItem
                    id={`decision-${opt.value}`}
                    value={opt.value}
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {decision === "auflage" && (
            <div className="space-y-2">
              <Label htmlFor="gate-conditions">Auflagen / Pflichten</Label>
              <Textarea
                id="gate-conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Bedingungen, die vor Fortsetzung erfüllt werden müssen…"
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="gate-reason">
              Begründung{" "}
              {decision === "abbruch" ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Textarea
              id="gate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Begründung der Entscheidung (vertraulich, verbleibt am Gate)…"
              rows={3}
              aria-invalid={abortNeedsReason}
            />
            <p className="text-xs text-muted-foreground">
              Die Begründung ist need-to-know-geschützt und verbleibt am Gate;
              der Log-Eintrag trägt nur das neutrale Ergebnis.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gate-confidentiality">Vertraulichkeit</Label>
            <Select
              value={confidentiality}
              onValueChange={(v) =>
                setConfidentiality(v as MaConfidentialityLevel)
              }
            >
              <SelectTrigger id="gate-confidentiality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONFIDENTIALITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || abortNeedsReason}
            variant={decision === "abbruch" ? "destructive" : "default"}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entscheidung festhalten
          </Button>
      </DialogFooter>
    </>
  )
}
