import { Badge } from "@/components/ui/badge"
import {
  APPROVAL_STATUS_LABELS,
  type ApprovalStatus,
} from "@/types/decision-approval"

const VARIANT: Record<
  ApprovalStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  withdrawn: "outline",
  expired: "destructive",
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge variant={VARIANT[status]} aria-label={`Genehmigungsstatus: ${APPROVAL_STATUS_LABELS[status]}`}>
      {APPROVAL_STATUS_LABELS[status]}
    </Badge>
  )
}
