import { Check, Hourglass, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  APPROVER_RESPONSE_LABELS,
  type DecisionApprover,
} from "@/types/decision-approval"

interface ApproverListProps {
  approvers: DecisionApprover[]
}

export function ApproverList({ approvers }: ApproverListProps) {
  if (approvers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Approver nominiert.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-md border">
      {approvers.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          <div className="flex flex-col">
            <span className="font-medium">
              {a.stakeholder_name ?? "Unbekannter Stakeholder"}
            </span>
            <span className="text-xs text-muted-foreground">
              {a.is_internal ? "Intern" : "Extern (Magic-Link)"}
              {a.responded_at &&
                ` · geantwortet am ${new Date(a.responded_at).toLocaleString("de-DE")}`}
            </span>
            {a.comment && (
              <span className="mt-1 text-xs italic text-muted-foreground">
                „{a.comment}&quot;
              </span>
            )}
          </div>
          <ApproverStatusBadge response={a.response} />
        </li>
      ))}
    </ul>
  )
}

function ApproverStatusBadge({
  response,
}: {
  response: DecisionApprover["response"]
}) {
  if (response === "approve") {
    return (
      <Badge variant="default">
        <Check className="mr-1 h-3 w-3" aria-hidden />
        {APPROVER_RESPONSE_LABELS.approve}
      </Badge>
    )
  }
  if (response === "reject") {
    return (
      <Badge variant="destructive">
        <X className="mr-1 h-3 w-3" aria-hidden />
        {APPROVER_RESPONSE_LABELS.reject}
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      <Hourglass className="mr-1 h-3 w-3" aria-hidden />
      {APPROVER_RESPONSE_LABELS.pending}
    </Badge>
  )
}
