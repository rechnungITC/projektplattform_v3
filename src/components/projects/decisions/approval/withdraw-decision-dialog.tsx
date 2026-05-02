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
import { Textarea } from "@/components/ui/textarea"
import { withdrawDecisionApproval } from "@/lib/decisions/approval-api"

interface WithdrawDecisionDialogProps {
  projectId: string
  decisionId: string
  decisionTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onWithdrawn: () => void
}

export function WithdrawDecisionDialog({
  projectId,
  decisionId,
  decisionTitle,
  open,
  onOpenChange,
  onWithdrawn,
}: WithdrawDecisionDialogProps) {
  const [reason, setReason] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await withdrawDecisionApproval(
        projectId,
        decisionId,
        reason.trim() || undefined,
      )
      toast.success("Entscheidung zurückgezogen", {
        description:
          "Alle Magic-Link-Tokens wurden invalidiert. Approver bekommen einen Hinweis beim nächsten Klick.",
      })
      onWithdrawn()
      onOpenChange(false)
    } catch (err) {
      toast.error("Zurückziehen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entscheidung zurückziehen</DialogTitle>
          <DialogDescription>
            <strong>„{decisionTitle}&quot;</strong> wird zurückgezogen. Offene
            Approval-Tokens werden invalidiert. Der Audit-Trail bleibt
            erhalten — du kannst eine neue Entscheidung als Revision anlegen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="withdraw-reason">Begründung (optional)</Label>
          <Textarea
            id="withdraw-reason"
            placeholder="z. B. Sachlage hat sich geändert, neue Informationen aufgetaucht."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={submitting}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Zurückziehen …
              </>
            ) : (
              "Zurückziehen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
