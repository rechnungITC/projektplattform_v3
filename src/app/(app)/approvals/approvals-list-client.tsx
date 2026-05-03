"use client"

import { CheckCircle2, ChevronRight } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { listPendingApprovals } from "@/lib/decisions/approval-api"
import type { PendingApprovalSummary } from "@/types/decision-approval"

export function ApprovalsListClient() {
  const [items, setItems] = React.useState<PendingApprovalSummary[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await listPendingApprovals()
      setItems(list)
    } catch (err) {
      toast.error("Genehmigungen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
          <div>
            <p className="text-base font-medium">Keine offenen Genehmigungen</p>
            <p className="text-sm text-muted-foreground">
              Sobald Sie als Approver nominiert sind, taucht die Anfrage hier auf.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.approver_id}>
          <Link
            href={`/projects/${item.project_id}/entscheidungen?decision=${item.decision_id}`}
            className="block rounded-md border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.project_name}
                </span>
                <span className="font-medium">{item.decision_title}</span>
                {item.submitted_at && (
                  <span className="text-xs text-muted-foreground">
                    Eingereicht am{" "}
                    {new Date(item.submitted_at).toLocaleDateString("de-DE")}
                  </span>
                )}
                {item.magic_link_expires_at && (
                  <span className="mt-1 text-xs text-muted-foreground">
                    Frist:{" "}
                    {new Date(item.magic_link_expires_at).toLocaleDateString(
                      "de-DE",
                    )}
                  </span>
                )}
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
