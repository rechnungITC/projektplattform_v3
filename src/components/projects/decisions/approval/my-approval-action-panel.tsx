"use client"

import { Check, HelpCircle, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { useAuth } from "@/hooks/use-auth"
import { respondAsInternalApprover } from "@/lib/decisions/approval-api"
import type { DecisionApprover } from "@/types/decision-approval"

interface MyApprovalActionPanelProps {
  projectId: string
  decisionId: string
  approvers: DecisionApprover[]
  onResponded: () => void
}

type DialogMode = null | "reject" | "request_info"

/**
 * PROJ-31 Round-2 — surfaces three action buttons (Freigeben / Ablehnen /
 * Info anfordern) for the logged-in user when they are a nominated
 * internal approver who has not yet responded. Reject and request_info
 * require a comment (5+ chars). Approve allows an optional comment.
 *
 * The panel hides itself when the user is not an approver, when they have
 * already responded (approve/reject — final), or when no auth user is
 * available.
 */
export function MyApprovalActionPanel({
  projectId,
  decisionId,
  approvers,
  onResponded,
}: MyApprovalActionPanelProps) {
  const { user } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)
  const [dialogMode, setDialogMode] = React.useState<DialogMode>(null)
  const [draftComment, setDraftComment] = React.useState("")

  const me = React.useMemo(
    () =>
      approvers.find(
        (a) => a.is_internal && a.linked_user_id && a.linked_user_id === user.id,
      ),
    [approvers, user.id],
  )

  if (!me) return null
  // Final responses are one-shot. Hide once the user has approved/rejected.
  if (me.response === "approve" || me.response === "reject") return null

  const submit = async (
    action: "approve" | "reject" | "request_info",
    comment: string | null,
  ) => {
    setSubmitting(true)
    try {
      await respondAsInternalApprover(projectId, decisionId, me.id, {
        action,
        comment,
      })
      toast.success(
        action === "approve"
          ? "Freigegeben"
          : action === "reject"
            ? "Abgelehnt"
            : "Info-Anfrage gesendet",
      )
      setDialogMode(null)
      setDraftComment("")
      onResponded()
    } catch (err) {
      toast.error("Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const trimmed = draftComment.trim()
  const dialogValid = trimmed.length >= 5 && trimmed.length <= 4000

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Meine Aktion</h3>
          <p className="text-xs text-muted-foreground">
            Sie sind als Approver für diese Entscheidung nominiert.
          </p>
        </div>

        {me.request_info_comment && me.request_info_at && (
          <Alert>
            <AlertDescription className="text-xs">
              Sie haben Informationen angefordert (
              {new Date(me.request_info_at).toLocaleString("de-DE")}):{" "}
              <em>„{me.request_info_comment}&ldquo;</em>. Sie können jederzeit
              final antworten oder erneut Infos anfragen.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void submit("approve", null)}
          >
            <Check className="mr-1 h-4 w-4" aria-hidden />
            Freigeben
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => {
              setDraftComment("")
              setDialogMode("reject")
            }}
          >
            <X className="mr-1 h-4 w-4" aria-hidden />
            Ablehnen
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => {
              setDraftComment("")
              setDialogMode("request_info")
            }}
          >
            <HelpCircle className="mr-1 h-4 w-4" aria-hidden />
            Info anfordern
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "reject"
                ? "Decision ablehnen"
                : "Mehr Informationen anfordern"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "reject"
                ? "Bitte geben Sie eine Begründung an. Sie wird in den Audit-Trail aufgenommen und ein offenes Item für den PM erzeugt."
                : "Welche Information benötigen Sie? Es wird ein offenes Item für den PM erzeugt; Ihre Antwort bleibt offen."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="approval-action-comment">
              {dialogMode === "reject" ? "Begründung" : "Frage / Hinweis"}
            </Label>
            <Textarea
              id="approval-action-comment"
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value)}
              placeholder={
                dialogMode === "reject"
                  ? "z. B. „Risiko-Schätzung fehlt"
                  : "z. B. „Welche Datenquelle wurde verwendet?"
              }
              rows={5}
              maxLength={4000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Mindestens 5 Zeichen ({trimmed.length} / 4000)
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogMode(null)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant={dialogMode === "reject" ? "destructive" : "default"}
              disabled={!dialogValid || submitting}
              onClick={() => {
                if (dialogMode === null) return
                void submit(dialogMode, trimmed)
              }}
            >
              {dialogMode === "reject" ? "Ablehnen" : "Anfrage senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
