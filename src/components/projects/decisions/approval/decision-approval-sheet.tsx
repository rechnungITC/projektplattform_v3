"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getDecisionApprovalBundle } from "@/lib/decisions/approval-api"
import { listStakeholders } from "@/lib/stakeholders/api"
import type { Decision } from "@/types/decision"
import type { DecisionApprovalBundle } from "@/types/decision-approval"
import type { Stakeholder } from "@/types/stakeholder"

import { ApprovalStatusBanner } from "./approval-status-banner"
import { ApprovalTrailTimeline } from "./approval-trail-timeline"
import { ApproverList } from "./approver-list"
import { ExtendDeadlineDialog } from "./extend-deadline-dialog"
import { MyApprovalActionPanel } from "./my-approval-action-panel"
import { SubmitForApprovalForm } from "./submit-for-approval-form"
import { WithdrawDecisionDialog } from "./withdraw-decision-dialog"

interface DecisionApprovalSheetProps {
  projectId: string
  decision: Decision | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function DecisionApprovalSheet({
  projectId,
  decision,
  open,
  onOpenChange,
  onChanged,
}: DecisionApprovalSheetProps) {
  const [bundle, setBundle] = React.useState<DecisionApprovalBundle | null>(null)
  const [approverPool, setApproverPool] = React.useState<Stakeholder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [withdrawOpen, setWithdrawOpen] = React.useState(false)

  const loadAll = React.useCallback(async () => {
    if (!decision) return
    setLoading(true)
    try {
      const [b, stakeholders] = await Promise.all([
        getDecisionApprovalBundle(projectId, decision.id),
        listStakeholders(projectId),
      ])
      setBundle(b)
      setApproverPool(
        stakeholders.filter((s) => s.is_active && s.is_approver === true),
      )
    } catch (err) {
      toast.error("Genehmigungs-Daten konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, decision])

  React.useEffect(() => {
    if (open && decision) void loadAll()
  }, [open, decision, loadAll])

  const handleSubmitted = async () => {
    await loadAll()
    onChanged()
  }

  const handleWithdrawn = async () => {
    await loadAll()
    onChanged()
  }

  if (!decision) return null

  const status = bundle?.state.status ?? "draft"
  const showSubmitForm = !bundle || status === "draft"
  const showStatusView = bundle !== null && status !== "draft"

  const receivedApprovals =
    bundle?.approvers.filter((a) => a.response === "approve").length ?? 0
  const receivedRejections =
    bundle?.approvers.filter((a) => a.response === "reject").length ?? 0

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>Genehmigung: {decision.title}</SheetTitle>
            <SheetDescription>
              {showSubmitForm
                ? "Approver nominieren und Quorum festlegen, dann zur Genehmigung einreichen."
                : "Status, Approver-Antworten und Audit-Trail dieser Entscheidung."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : showSubmitForm ? (
              <SubmitForApprovalForm
                projectId={projectId}
                decisionId={decision.id}
                approverPool={approverPool}
                onSubmitted={() => {
                  void handleSubmitted()
                }}
                onCancel={() => onOpenChange(false)}
              />
            ) : showStatusView && bundle ? (
              <>
                <ApprovalStatusBanner
                  state={bundle.state}
                  receivedApprovals={receivedApprovals}
                  receivedRejections={receivedRejections}
                  totalApprovers={bundle.approvers.length}
                />

                {status === "pending" && (
                  <MyApprovalActionPanel
                    projectId={projectId}
                    decisionId={decision.id}
                    approvers={bundle.approvers}
                    onResponded={() => {
                      void handleSubmitted()
                    }}
                  />
                )}

                <Tabs defaultValue="approvers">
                  <TabsList>
                    <TabsTrigger value="approvers">
                      Approver ({bundle.approvers.length})
                    </TabsTrigger>
                    <TabsTrigger value="trail">
                      Audit-Trail ({bundle.events.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="approvers" className="pt-4">
                    <ApproverList approvers={bundle.approvers} />
                  </TabsContent>
                  <TabsContent value="trail" className="pt-4">
                    <ApprovalTrailTimeline events={bundle.events} />
                  </TabsContent>
                </Tabs>

                {status === "pending" && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <ExtendDeadlineDialog
                      projectId={projectId}
                      decisionId={decision.id}
                      currentDeadline={bundle.state.deadline_at ?? null}
                      onExtended={() => {
                        void handleSubmitted()
                      }}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setWithdrawOpen(true)}
                    >
                      Zurückziehen
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <WithdrawDecisionDialog
        projectId={projectId}
        decisionId={decision.id}
        decisionTitle={decision.title}
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        onWithdrawn={() => {
          void handleWithdrawn()
        }}
      />
    </>
  )
}
