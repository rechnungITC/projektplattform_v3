"use client"

import { CheckCircle2, ChevronRight, FileCheck2 } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendingDeliverableApprovalSummary } from "@/types/deliverable-approval-workflow"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"

interface DeliverableApprovalInboxPanelProps {
  approvals: PendingDeliverableApprovalSummary[] | null
  isLoading: boolean
  error: string | null
  onRetry: () => void | Promise<void>
}

/**
 * PROJ-105 α — deliverable Freigaben awaiting the current user as the active
 * approver. Sources /api/dashboard/deliverable-approvals via
 * {@link useMyDeliverableApprovals}. Clicking opens the deliverable's Freigabe
 * surface (?freigabe=<deliverable_id> auto-opens the panel).
 */
export function DeliverableApprovalInboxPanel({
  approvals,
  isLoading,
  error,
  onRetry,
}: DeliverableApprovalInboxPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          Deliverable-Freigaben
        </CardTitle>
        {approvals && approvals.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {approvals.length} offen
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DashboardSectionSkeleton rows={2} />
        ) : error ? (
          <DashboardSectionError
            title="Deliverable-Freigaben"
            message={error}
            onRetry={onRetry}
          />
        ) : !approvals || approvals.length === 0 ? (
          <DashboardSectionEmpty
            icon={CheckCircle2}
            title="Keine offenen Freigaben"
            description="Sobald du als Freigeber an der Reihe bist, erscheint das Deliverable hier."
          />
        ) : (
          <ul className="space-y-2">
            {approvals.slice(0, 5).map((item) => (
              <li key={item.stage_id}>
                <Link
                  href={`/projects/${item.project_id}/deliverables?freigabe=${item.deliverable_id}`}
                  className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {item.project_name}
                    </span>
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.deliverable_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stufe {item.stage_order} · eingereicht am{" "}
                      {new Date(item.submitted_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
