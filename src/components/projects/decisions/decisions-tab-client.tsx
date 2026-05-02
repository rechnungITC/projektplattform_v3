"use client"

import { Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { OpenItemsPanel } from "@/components/projects/open-items/open-items-panel"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  createDecision,
  type DecisionInput,
  listDecisions,
} from "@/lib/decisions/api"
import { listStakeholders } from "@/lib/stakeholders/api"
import type { Decision } from "@/types/decision"
import type { Stakeholder } from "@/types/stakeholder"

import { DecisionApprovalSheet } from "./approval/decision-approval-sheet"
import { DecisionForm } from "./decision-form"
import { DecisionsTimeline } from "./decisions-timeline"

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "revise"; predecessor: Decision }

interface DecisionsTabClientProps {
  projectId: string
}

export function DecisionsTabClient({ projectId }: DecisionsTabClientProps) {
  const [decisions, setDecisions] = React.useState<Decision[]>([])
  const [stakeholders, setStakeholders] = React.useState<Stakeholder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)
  // PROJ-31 — separate sheet for managing the approval workflow.
  const [approvalDecision, setApprovalDecision] =
    React.useState<Decision | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      const [decisionList, stakeholderList] = await Promise.all([
        listDecisions(projectId, { includeRevised: true }),
        listStakeholders(projectId),
      ])
      setDecisions(decisionList)
      setStakeholders(stakeholderList)
    } catch (err) {
      toast.error("Entscheidungen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const onCreate = async (input: DecisionInput) => {
    setSubmitting(true)
    try {
      await createDecision(projectId, input)
      toast.success(
        input.supersedes_decision_id
          ? "Revision gespeichert"
          : "Entscheidung geloggt"
      )
      setDrawer({ mode: "closed" })
      await reload()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Entscheidungen
            </h1>
            <p className="text-sm text-muted-foreground">
              Append-only: Revisionen erstellen einen neuen Eintrag, der den
              Vorgänger als überholt markiert. Der Verlauf bleibt erhalten.
            </p>
          </div>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Entscheidung
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">
                Lade Entscheidungen …
              </p>
            ) : (
              <DecisionsTimeline
                decisions={decisions}
                onRevise={(d) =>
                  setDrawer({ mode: "revise", predecessor: d })
                }
                onManageApproval={(d) => setApprovalDecision(d)}
              />
            )}
          </div>

          <aside>
            <OpenItemsPanel
              projectId={projectId}
              onDecisionCreated={() => void reload()}
            />
          </aside>
        </div>
      </div>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "revise"
                ? `Revision: ${drawer.predecessor.title}`
                : "Neue Entscheidung"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "revise"
                ? "Eine neue Version der Entscheidung anlegen. Der Vorgänger bleibt vorhanden, wird aber als überholt markiert."
                : "Eine Entscheidung mit Begründung loggen."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drawer.mode === "revise" ? (
              <DecisionForm
                supersedes={drawer.predecessor}
                stakeholders={stakeholders}
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={onCreate}
                submitting={submitting}
              />
            ) : drawer.mode === "create" ? (
              <DecisionForm
                stakeholders={stakeholders}
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={onCreate}
                submitting={submitting}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <DecisionApprovalSheet
        projectId={projectId}
        decision={approvalDecision}
        open={approvalDecision !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalDecision(null)
        }}
        onChanged={() => void reload()}
      />
    </>
  )
}
