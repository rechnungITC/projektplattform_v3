import { CheckCircle2, Clock, XCircle, X } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
      icon = <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
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
  }

  return (
    <Alert>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 space-y-1">
          <AlertTitle>{label}</AlertTitle>
          <AlertDescription>{body}</AlertDescription>
        </div>
      </div>
    </Alert>
  )
}
