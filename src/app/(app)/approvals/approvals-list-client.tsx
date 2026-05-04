"use client"

import { Check, CheckCircle2, ChevronRight, Clock, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { listPendingApprovals } from "@/lib/decisions/approval-api"
import type { PendingApprovalSummary } from "@/types/decision-approval"

type Filter = "pending" | "answered"

export function ApprovalsListClient() {
  const [tab, setTab] = React.useState<Filter>("pending")
  const [pending, setPending] = React.useState<PendingApprovalSummary[] | null>(
    null,
  )
  const [answered, setAnswered] = React.useState<
    PendingApprovalSummary[] | null
  >(null)
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async (filter: Filter) => {
    setLoading(true)
    try {
      const list = await listPendingApprovals(filter)
      if (filter === "pending") setPending(list)
      else setAnswered(list)
    } catch (err) {
      toast.error("Genehmigungen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
      if (filter === "pending") setPending([])
      else setAnswered([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load both lists on mount so the tab counts are accurate.
  React.useEffect(() => {
    void reload("pending")
    void reload("answered")
  }, [reload])

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Filter)}>
      <TabsList>
        <TabsTrigger value="pending">
          Offen
          {pending !== null && pending.length > 0 ? (
            <Badge variant="secondary" className="ml-2">
              {pending.length}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="answered">
          Beantwortet
          {answered !== null && answered.length > 0 ? (
            <Badge variant="outline" className="ml-2">
              {answered.length}
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="pt-4">
        <ApprovalList
          loading={loading && pending === null}
          items={pending ?? []}
          mode="pending"
        />
      </TabsContent>

      <TabsContent value="answered" className="pt-4">
        <ApprovalList
          loading={loading && answered === null}
          items={answered ?? []}
          mode="answered"
        />
      </TabsContent>
    </Tabs>
  )
}

function ApprovalList({
  loading,
  items,
  mode,
}: {
  loading: boolean
  items: PendingApprovalSummary[]
  mode: "pending" | "answered"
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
          <div>
            <p className="text-base font-medium">
              {mode === "pending"
                ? "Keine offenen Genehmigungen"
                : "Noch keine beantworteten Genehmigungen"}
            </p>
            <p className="text-sm text-muted-foreground">
              {mode === "pending"
                ? "Sobald Sie als Approver nominiert sind, taucht die Anfrage hier auf."
                : "Hier erscheinen Genehmigungen, die Sie bereits freigegeben oder abgelehnt haben."}
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
                    {mode === "pending" ? (
                      <DurationSince since={item.submitted_at} />
                    ) : null}
                  </span>
                )}
                {item.deadline_at && (
                  <DeadlineBadge
                    deadline={item.deadline_at}
                    answered={mode === "answered"}
                  />
                )}
                {mode === "answered" && item.response && (
                  <span className="mt-1 text-xs">
                    {item.response === "approve" ? (
                      <Badge variant="default" className="gap-1">
                        <Check className="h-3 w-3" aria-hidden /> Freigegeben
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <X className="h-3 w-3" aria-hidden /> Abgelehnt
                      </Badge>
                    )}
                    {item.responded_at && (
                      <span className="ml-2 text-muted-foreground">
                        am{" "}
                        {new Date(item.responded_at).toLocaleString("de-DE")}
                      </span>
                    )}
                  </span>
                )}
                {mode === "answered" && item.approval_status && (
                  <span className="mt-1 text-xs text-muted-foreground">
                    Stand der Decision:{" "}
                    <strong>{translateStatus(item.approval_status)}</strong>
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

function DurationSince({ since }: { since: string }) {
  const days = Math.max(
    0,
    Math.floor(
      // eslint-disable-next-line react-hooks/purity -- day-granularity countdown.
      (Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24),
    ),
  )
  if (days === 0) return <span> · heute</span>
  return (
    <span>
      {" "}· seit {days} {days === 1 ? "Tag" : "Tagen"}
    </span>
  )
}

function DeadlineBadge({
  deadline,
  answered,
}: {
  deadline: string
  answered: boolean
}) {
  const target = new Date(deadline).getTime()
  // eslint-disable-next-line react-hooks/purity -- day-granularity countdown.
  const now = Date.now()
  const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24))
  const overdue = days < 0
  const variant: "default" | "destructive" | "outline" = answered
    ? "outline"
    : overdue
      ? "destructive"
      : days <= 3
        ? "default"
        : "outline"
  return (
    <Badge variant={variant} className="mt-1 w-fit gap-1 text-xs">
      <Clock className="h-3 w-3" aria-hidden />
      Frist:{" "}
      {new Date(deadline).toLocaleDateString("de-DE")}
      {!answered && (
        <span>
          {overdue
            ? ` (${Math.abs(days)} Tage überfällig)`
            : days === 0
              ? " (heute!)"
              : ` (${days} Tage)`}
        </span>
      )}
    </Badge>
  )
}

function translateStatus(s: string): string {
  switch (s) {
    case "approved":
      return "Genehmigt"
    case "rejected":
      return "Abgelehnt"
    case "pending":
      return "Offen"
    case "withdrawn":
      return "Zurückgezogen"
    case "draft":
      return "Entwurf"
    default:
      return s
  }
}
