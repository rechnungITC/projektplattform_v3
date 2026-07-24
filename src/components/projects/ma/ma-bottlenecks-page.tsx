"use client"

import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useTaskBottlenecks } from "@/hooks/use-task-bottlenecks"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import {
  taskBottlenecksExportUrl,
  type TaskBottleneckRow,
} from "@/lib/work-items/task-bottlenecks"
import {
  WORK_ITEM_STATUS_LABELS,
  type WorkItemStatus,
} from "@/types/work-item"

type QuickFilter = "all" | "overdue" | "today" | "week" | "blocked"
type GroupBy = "none" | "owner" | "workstream"

const NO_OWNER = "__no_owner__"
const NO_WORKSTREAM = "__no_workstream__"

function matchesFilter(t: TaskBottleneckRow, f: QuickFilter): boolean {
  switch (f) {
    case "overdue":
      return t.is_overdue
    case "today":
      return t.is_due_today
    case "week":
      return t.is_due_this_week
    case "blocked":
      return t.is_blocked
    default:
      return true
  }
}

function DueCell({ task }: { task: TaskBottleneckRow }) {
  if (!task.due_date) return <span className="text-muted-foreground">—</span>
  return (
    <span className={task.is_overdue ? "font-medium text-destructive" : ""}>
      {task.due_date}
    </span>
  )
}

function OverdueCell({ days }: { days: number }) {
  if (days <= 0) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="destructive" className="tabular-nums">
      {days} Tag{days === 1 ? "" : "e"}
    </Badge>
  )
}

function BottleneckTable({
  tasks,
  userName,
}: {
  tasks: TaskBottleneckRow[]
  userName: Map<string, string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aufgabe</TableHead>
            <TableHead>Workstream</TableHead>
            <TableHead>Phase</TableHead>
            <TableHead>Verantwortlich</TableHead>
            <TableHead>Frist</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Tage über Frist</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="max-w-[24rem] font-medium">
                <span className="line-clamp-2">{t.title}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.workstream_label ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.phase_name ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.responsible_user_id
                  ? (userName.get(t.responsible_user_id) ?? "—")
                  : "—"}
              </TableCell>
              <TableCell>
                <DueCell task={t} />
              </TableCell>
              <TableCell>
                <Badge
                  variant={t.is_blocked ? "destructive" : "outline"}
                  className="text-[11px]"
                >
                  {WORK_ITEM_STATUS_LABELS[t.status as WorkItemStatus] ??
                    t.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <OverdueCell days={t.days_overdue} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface Group {
  key: string
  label: string
  tasks: TaskBottleneckRow[]
}

export function MaBottlenecksPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { overview, loading, error, refresh } = useTaskBottlenecks(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const [filter, setFilter] = React.useState<QuickFilter>("all")
  const [groupBy, setGroupBy] = React.useState<GroupBy>("none")

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const member of members) {
      m.set(
        member.user_id,
        member.display_name ?? member.email.split("@")[0] ?? "—"
      )
    }
    return m
  }, [members])

  const tasks = React.useMemo(() => overview?.tasks ?? [], [overview])
  const summary = overview?.summary
  const top = overview?.top_bottlenecks ?? []

  const filtered = React.useMemo(
    () => tasks.filter((t) => matchesFilter(t, filter)),
    [tasks, filter]
  )

  const groups = React.useMemo<Group[]>(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", tasks: filtered }]
    }
    const map = new Map<string, TaskBottleneckRow[]>()
    for (const t of filtered) {
      const key =
        groupBy === "owner"
          ? (t.responsible_user_id ?? NO_OWNER)
          : (t.workstream_id ?? NO_WORKSTREAM)
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    const out: Group[] = []
    for (const [key, arr] of map) {
      let label: string
      if (groupBy === "owner") {
        label =
          key === NO_OWNER ? "Ohne Verantwortlichen" : (userName.get(key) ?? "—")
      } else {
        label =
          key === NO_WORKSTREAM
            ? "Ohne Workstream"
            : (arr[0]?.workstream_label ?? "—")
      }
      out.push({ key, label, tasks: arr })
    }
    out.sort((a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label))
    return out
  }, [groupBy, filtered, userName])

  const FILTERS: { value: QuickFilter; label: string; count?: number }[] = [
    { value: "all", label: "Alle", count: summary?.open_total },
    { value: "overdue", label: "Überfällig", count: summary?.overdue_total },
    { value: "today", label: "Heute fällig", count: summary?.due_today_total },
    { value: "week", label: "Diese Woche", count: summary?.due_this_week_total },
    { value: "blocked", label: "Blockiert", count: summary?.blocked_total },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Engpass-Übersicht
          </h1>
          <p className="text-sm text-muted-foreground">
            Alle offenen Aufgaben über alle Workstreams — überfällige und
            blockierte zuerst. Nur Aufgaben, die Sie sehen dürfen.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" disabled={tasks.length === 0}>
          <a href={taskBottlenecksExportUrl(projectId)} download>
            <Download className="h-4 w-4" aria-hidden />
            CSV-Export
          </a>
        </Button>
      </div>

      {/* Top-3 bottlenecks — AC3 */}
      {top.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              Top-Engpässe
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-2">
              {top.map((t, i) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      #{i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {t.title}
                    </span>
                    {t.workstream_label && (
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {t.workstream_label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {t.responsible_user_id && (
                      <span className="truncate">
                        {userName.get(t.responsible_user_id) ?? "—"}
                      </span>
                    )}
                    {t.due_date && <span>{t.due_date}</span>}
                    <Badge variant="destructive" className="tabular-nums">
                      {t.days_overdue} Tag{t.days_overdue === 1 ? "" : "e"} über
                    </Badge>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Quick filters — AC2 */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {typeof f.count === "number" && (
              <span className="ml-1.5 rounded bg-background/20 px-1 text-[11px] tabular-nums">
                {f.count}
              </span>
            )}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gruppieren:</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[190px]" aria-label="Gruppierung">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">keine</SelectItem>
              <SelectItem value="owner">nach Verantwortlichem</SelectItem>
              <SelectItem value="workstream">nach Workstream</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Lade Engpass-Übersicht …
        </div>
      ) : error ? (
        <div className="space-y-3 py-6">
          <p className="text-sm text-destructive">
            Übersicht konnte nicht geladen werden: {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Erneut versuchen
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div
          className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-12 text-center text-sm"
          role="status"
        >
          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden />
          <span className="mx-auto">Keine offenen Aufgaben in diesem Projekt.</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
          Keine Aufgaben für diesen Filter.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="space-y-3">
              {group.label && (
                <div className="flex items-center gap-2 border-b pb-1">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {group.tasks.length} Aufgabe
                    {group.tasks.length === 1 ? "" : "n"}
                  </span>
                </div>
              )}
              <BottleneckTable tasks={group.tasks} userName={userName} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
