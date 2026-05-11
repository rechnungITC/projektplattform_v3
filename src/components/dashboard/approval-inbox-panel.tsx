"use client"

import { CheckCircle2, ChevronRight, Clock, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendingApprovalSummary } from "@/types/decision-approval"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"

interface ApprovalInboxPanelProps {
  approvals: PendingApprovalSummary[] | null
  isLoading: boolean
  error: string | null
  onRetry: () => void | Promise<void>
}

/**
 * PROJ-64 AC-3 — pending approvals nominated to the current user.
 *
 * Sources data from PROJ-31's `/api/dashboard/approvals?filter=pending`
 * via {@link usePendingApprovals}. When the global summary endpoint
 * goes live, this panel can be wired to `summary.approvals.data.items`
 * instead — the visual contract stays identical.
 */
export function ApprovalInboxPanel({
  approvals,
  isLoading,
  error,
  onRetry,
}: ApprovalInboxPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden />
          Genehmigungen
        </CardTitle>
        {approvals && approvals.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {approvals.length} offen
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Body
          approvals={approvals}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  )
}

function Body({
  approvals,
  isLoading,
  error,
  onRetry,
}: ApprovalInboxPanelProps) {
  if (isLoading) {
    return <DashboardSectionSkeleton rows={2} />
  }
  if (error) {
    return (
      <DashboardSectionError
        title="Genehmigungen"
        message={error}
        onRetry={onRetry}
      />
    )
  }
  if (!approvals || approvals.length === 0) {
    return (
      <DashboardSectionEmpty
        icon={CheckCircle2}
        title="Keine offenen Genehmigungen"
        description="Sobald du als Approver nominiert wirst, erscheint die Anfrage hier."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {approvals.slice(0, 5).map((item) => (
        <li key={item.approver_id}>
          <Link
            href={`/projects/${item.project_id}/entscheidungen?decision=${item.decision_id}`}
            className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.project_name}
                </span>
                <DeadlineHint deadlineAt={item.deadline_at ?? null} />
              </div>
              <p className="truncate text-sm font-medium text-foreground">
                {item.decision_title}
              </p>
              {item.submitted_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Eingereicht am{" "}
                  {new Date(item.submitted_at).toLocaleDateString("de-DE")}
                </p>
              )}
            </div>
            <ChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
      {approvals.length > 5 && (
        <li>
          <Link
            href="/approvals"
            className="block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Alle {approvals.length} Genehmigungen ansehen
          </Link>
        </li>
      )}
    </ul>
  )
}

function DeadlineHint({ deadlineAt }: { deadlineAt: string | null }) {
  if (!deadlineAt) return null
  const days = Math.ceil(
    // eslint-disable-next-line react-hooks/purity -- day-granularity countdown.
    (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (days < 0) {
    return (
      <Badge variant="destructive" className="h-5 text-[10px]">
        <Clock className="mr-1 h-3 w-3" aria-hidden />
        {Math.abs(days)} Tage überfällig
      </Badge>
    )
  }
  if (days <= 3) {
    return (
      <Badge className="h-5 text-[10px]">
        <Clock className="mr-1 h-3 w-3" aria-hidden />
        {days === 0 ? "heute fällig" : `${days} Tage`}
      </Badge>
    )
  }
  return null
}
