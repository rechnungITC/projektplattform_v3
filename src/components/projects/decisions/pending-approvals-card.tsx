"use client"

import { CalendarClock, ChevronRight, FileCheck2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

interface PendingApprovalRow {
  decision_id: string
  decision_title: string
  submitted_at: string | null
  deadline_at: string | null
}

interface PendingApprovalsCardProps {
  projectId: string
}

/**
 * PROJ-31 follow-up — surfaces decisions whose approval state is still
 * 'pending' on the project overview. Shows how long each one has been
 * waiting and the optional deadline. Clicking a row deep-links to the
 * Entscheidungen tab with the highlight scroll already wired in
 * decisions-tab-client (PROJ-31 link-fix slice).
 *
 * Hides itself when there are no pending approvals so the overview
 * doesn't get cluttered with empty states.
 */
export function PendingApprovalsCard({ projectId }: PendingApprovalsCardProps) {
  const [rows, setRows] = React.useState<PendingApprovalRow[] | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        // Join decisions → decision_approval_state. RLS scopes to tenant.
        type Row = {
          decision_id: string
          submitted_at: string | null
          deadline_at: string | null
          decisions: { title: string; project_id: string; is_revised: boolean } | null
        }
        const { data } = await supabase
          .from("decision_approval_state")
          .select(
            "decision_id, submitted_at, deadline_at, decisions!inner(title, project_id, is_revised)",
          )
          .eq("status", "pending")
          .eq("decisions.project_id", projectId)
          .order("submitted_at", { ascending: true, nullsFirst: false })
          .limit(20)
        if (cancelled) return
        const list: PendingApprovalRow[] = (data ?? [])
          .map((r) => r as unknown as Row)
          .filter((r) => r.decisions && !r.decisions.is_revised)
          .map((r) => ({
            decision_id: r.decision_id,
            decision_title: r.decisions!.title,
            submitted_at: r.submitted_at,
            deadline_at: r.deadline_at,
          }))
        setRows(list)
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (rows === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCheck2 className="h-5 w-5" aria-hidden />
            Offene Genehmigungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck2 className="h-5 w-5" aria-hidden />
          Offene Genehmigungen
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {rows.map((r) => {
            const submittedDays = r.submitted_at
              ? Math.max(
                  0,
                  Math.floor(
                    // eslint-disable-next-line react-hooks/purity -- day-granularity age.
                    (Date.now() - new Date(r.submitted_at).getTime()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )
              : null
            const deadlineDays = r.deadline_at
              ? Math.ceil(
                  // eslint-disable-next-line react-hooks/purity -- day-granularity countdown.
                  (new Date(r.deadline_at).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                )
              : null
            const overdue = deadlineDays !== null && deadlineDays < 0
            return (
              <li key={r.decision_id}>
                <Link
                  href={`/projects/${projectId}/entscheidungen?decision=${r.decision_id}`}
                  className="flex items-start justify-between gap-3 px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{r.decision_title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.submitted_at ? (
                        <>
                          Eingereicht am{" "}
                          {new Date(r.submitted_at).toLocaleDateString("de-DE")}
                          {submittedDays !== null && submittedDays > 0 && (
                            <> · seit {submittedDays} {submittedDays === 1 ? "Tag" : "Tagen"}</>
                          )}
                        </>
                      ) : (
                        "Noch nicht eingereicht"
                      )}
                    </span>
                    {r.deadline_at && (
                      <Badge
                        variant={
                          overdue
                            ? "destructive"
                            : (deadlineDays ?? 99) <= 3
                              ? "default"
                              : "outline"
                        }
                        className="mt-1 w-fit gap-1 text-xs"
                      >
                        <CalendarClock className="h-3 w-3" aria-hidden />
                        Frist:{" "}
                        {new Date(r.deadline_at).toLocaleDateString("de-DE")}
                        {deadlineDays !== null && (
                          <span>
                            {overdue
                              ? ` · ${Math.abs(deadlineDays)} Tage überfällig`
                              : deadlineDays === 0
                                ? " · heute"
                                : ` · in ${deadlineDays} Tagen`}
                          </span>
                        )}
                      </Badge>
                    )}
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
