"use client"

import { CheckCircle2, Loader2, ThumbsDown, ThumbsUp } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { respondViaToken } from "@/lib/decisions/approval-api"

interface ApproveFormProps {
  token: string
  approverName: string
  alreadyResponded: boolean
}

type ConfirmationState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted"; response: "approve" | "reject" }
  | { kind: "error"; message: string }

export function ApproveForm({
  token,
  approverName,
  alreadyResponded,
}: ApproveFormProps) {
  const [comment, setComment] = React.useState("")
  const [state, setState] = React.useState<ConfirmationState>(
    alreadyResponded
      ? { kind: "submitted", response: "approve" }
      : { kind: "idle" },
  )

  if (alreadyResponded || state.kind === "submitted") {
    return (
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          </div>
          <CardTitle>Antwort registriert</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Vielen Dank, {approverName}. Ihre Antwort wurde gespeichert. Sie
            können dieses Fenster jetzt schließen.
          </p>
          <p className="text-xs text-muted-foreground">
            Falls Sie versehentlich geantwortet haben, kontaktieren Sie bitte
            den Projektmanager — Antworten sind aus Audit-Gründen nicht
            editierbar, der PM kann aber bei Bedarf eine Revision der
            Entscheidung anstoßen.
          </p>
        </CardContent>
      </Card>
    )
  }

  const submit = async (response: "approve" | "reject") => {
    setState({ kind: "submitting" })
    try {
      await respondViaToken(token, {
        response,
        comment: comment.trim() || null,
      })
      setState({ kind: "submitted", response })
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const submitting = state.kind === "submitting"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ihre Antwort</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="approver-comment">Kommentar (optional)</Label>
          <Textarea
            id="approver-comment"
            placeholder="Anmerkungen, Bedingungen, Vorbehalte …"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitting}
          />
        </div>

        {state.kind === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => submit("reject")}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ThumbsDown className="mr-2 h-4 w-4" aria-hidden />
            )}
            Ablehnen
          </Button>
          <Button
            type="button"
            onClick={() => submit("approve")}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ThumbsUp className="mr-2 h-4 w-4" aria-hidden />
            )}
            Zustimmen
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Sobald Sie geantwortet haben, ist die Antwort endgültig. Mehrfaches
          Klicken hat keine zusätzliche Wirkung.
        </p>
      </CardContent>
    </Card>
  )
}
