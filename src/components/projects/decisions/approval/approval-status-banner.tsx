import { CalendarClock, CheckCircle2, Clock, TimerOff, XCircle, X } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  APPROVAL_STATUS_LABELS,
  type DecisionApprovalState,
} from "@/types/decision-approval"

interface ApprovalStatusBannerProps {
  state: DecisionApprovalState
  receivedApprovals: number
  receivedRejections: number
  totalApprovers: number
}

export function ApprovalStatusBanner({
  state,
  receivedApprovals,
  receivedRejections,
  totalApprovers,
}: ApprovalStatusBannerProps) {
  const label = APPROVAL_STATUS_LABELS[state.status]
  const quorum = state.quorum_required ?? 0

  let icon = <Clock className="h-4 w-4" aria-hidden />
  let body = ""

  switch (state.status) {
    case "draft":
      body = "Diese Entscheidung wurde noch nicht zur Genehmigung eingereicht."
      break
    case "pending":
      icon = <Clock className="h-4 w-4" aria-hidden />
      body = `${receivedApprovals} von ${quorum} Zustimmungen erforderlich · ${
        totalApprovers - receivedApprovals - receivedRejections
      } Approver haben noch nicht geantwortet.`
      break
    case "approved":
      icon = <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
      body = `Quorum erreicht: ${receivedApprovals} von ${quorum} Approver haben zugestimmt.`
      break
    case "rejected":
      icon = <XCircle className="h-4 w-4 text-destructive" aria-hidden />
      body = `Quorum unmöglich: ${receivedRejections} Ablehnungen — keine ausreichenden Zustimmungen mehr erreichbar.`
      break
    case "withdrawn":
      icon = <X className="h-4 w-4 text-muted-foreground" aria-hidden />
      body = "Der Projektmanager hat diese Entscheidung zurückgezogen."
      break
    case "expired":
      icon = <TimerOff className="h-4 w-4 text-warning" aria-hidden />
      body =
        "Die Frist ist abgelaufen, ohne dass das Quorum erreicht wurde. Eine Revision oder Neuvorlage ist nötig."
      break
  }

  // PROJ-31 follow-up — countdown for the optional deadline.
  const deadline = state.deadline_at ? new Date(state.deadline_at) : null
  const deadlineDays = deadline
    ? // eslint-disable-next-line react-hooks/purity -- day-granularity countdown.
      Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const overdue = deadlineDays !== null && deadlineDays < 0

  return (
    <Alert>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 space-y-1">
          <AlertTitle>{label}</AlertTitle>
          <AlertDescription>{body}</AlertDescription>
          {state.submitted_at && state.status === "pending" && (
            <p className="text-xs text-muted-foreground">
              Eingereicht am{" "}
              {new Date(state.submitted_at).toLocaleDateString("de-DE")}
              {" · "}
              <SubmissionAge submitted={state.submitted_at} />
            </p>
          )}
          {deadline && (
            <Badge
              variant={
                state.status !== "pending"
                  ? "outline"
                  : overdue
                    ? "destructive"
                    : (deadlineDays ?? 99) <= 3
                      ? "default"
                      : "outline"
              }
              className="mt-1 w-fit gap-1 text-xs"
            >
              <CalendarClock className="h-3 w-3" aria-hidden />
              Frist: {deadline.toLocaleDateString("de-DE")}
              {state.status === "pending" && deadlineDays !== null && (
                <span>
                  {overdue
                    ? ` · ${Math.abs(deadlineDays)} Tage überfällig`
                    : deadlineDays === 0
                      ? " · heute!"
                      : ` · in ${deadlineDays} Tagen`}
                </span>
              )}
            </Badge>
          )}
        </div>
      </div>
    </Alert>
  )
}

function SubmissionAge({ submitted }: { submitted: string }) {
  const days = Math.max(
    0,
    Math.floor(
      // eslint-disable-next-line react-hooks/purity -- day-granularity age.
      (Date.now() - new Date(submitted).getTime()) / (1000 * 60 * 60 * 24),
    ),
  )
  if (days === 0) return <span>heute</span>
  return (
    <span>
      seit {days} {days === 1 ? "Tag" : "Tagen"}
    </span>
  )
}
