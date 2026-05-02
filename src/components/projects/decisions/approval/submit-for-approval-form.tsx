"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { submitDecisionForApproval } from "@/lib/decisions/approval-api"
import type { Stakeholder } from "@/types/stakeholder"

import { ApproverSelector } from "./approver-selector"

/**
 * PROJ-31 — wraps the post-creation "Submit for approval" UX.
 *
 * Used both as a follow-up sheet after `decision-form.tsx` saved a draft
 * Decision, and as a standalone action on a draft Decision detail page.
 */

interface SubmitForApprovalFormProps {
  projectId: string
  decisionId: string
  /** Pool — already filtered server-side to is_approver=true. */
  approverPool: Stakeholder[]
  onSubmitted: () => void
  onCancel: () => void
}

export function SubmitForApprovalForm({
  projectId,
  decisionId,
  approverPool,
  onSubmitted,
  onCancel,
}: SubmitForApprovalFormProps) {
  const [selected, setSelected] = React.useState<string[]>([])
  const [rawQuorum, setRawQuorum] = React.useState<number>(1)
  const [submitting, setSubmitting] = React.useState(false)

  // Derived: clamp the displayed/submitted quorum to [1, N] without an effect.
  const quorum =
    selected.length === 0
      ? 1
      : Math.min(Math.max(1, rawQuorum), selected.length)

  const canSubmit = selected.length >= 1 && quorum >= 1 && quorum <= selected.length

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await submitDecisionForApproval(projectId, decisionId, {
        approver_stakeholder_ids: selected,
        quorum_required: quorum,
      })
      toast.success("Zur Genehmigung eingereicht", {
        description: `${selected.length} Approver eingeladen, Quorum ${quorum} von ${selected.length}.`,
      })
      onSubmitted()
    } catch (err) {
      toast.error("Einreichen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Approver-Mails enthalten <strong>nur Titel und Token-Link</strong> —
          niemals den Entscheidungs-Body. Body wird erst nach Token-Validierung
          auf der Approval-Page gerendert.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Approver auswählen</Label>
        <ApproverSelector
          stakeholders={approverPool}
          value={selected}
          onChange={setSelected}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quorum-input">
          Quorum (M von {selected.length || "N"})
        </Label>
        <Input
          id="quorum-input"
          type="number"
          min={1}
          max={Math.max(1, selected.length)}
          value={quorum}
          onChange={(e) => setRawQuorum(Number.parseInt(e.target.value, 10) || 1)}
          disabled={submitting || selected.length === 0}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          Wie viele der ausgewählten Approver müssen zustimmen, damit die
          Entscheidung als genehmigt gilt.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Abbrechen
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Einreichen …
            </>
          ) : (
            "Zur Genehmigung einreichen"
          )}
        </Button>
      </div>
    </div>
  )
}
