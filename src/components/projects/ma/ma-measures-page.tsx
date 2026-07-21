"use client"

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react"
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
import { useAuth } from "@/hooks/use-auth"
import { useRiskMeasureOverview } from "@/hooks/use-risk-measure-overview"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useWorkstreams } from "@/hooks/use-workstreams"
import { riskSeverityBadgeTone, riskSeverityBucket } from "@/lib/risks/severity"
import type {
  RiskMeasure,
  RiskMeasureRow,
} from "@/lib/risks/measure-overview"
import { RISK_STATUS_LABELS, type RiskStatus } from "@/types/risk"
import {
  WORK_ITEM_STATUS_LABELS,
  type WorkItemStatus,
} from "@/types/work-item"

type GroupBy = "risk" | "owner" | "workstream"

const NO_OWNER = "__no_owner__"
const NO_WORKSTREAM = "__no_workstream__"

/** Overdue = a due date in the past on a measure that is still actionable. */
function isOverdue(m: RiskMeasure, todayIso: string): boolean {
  if (!m.due_date) return false
  if (m.status === "done" || m.status === "cancelled") return false
  return m.due_date < todayIso
}

/** Coverage badge for a risk — AC3 soft hint surface. */
function CoverageBadge({ risk }: { risk: RiskMeasureRow }) {
  if (risk.active_uncovered) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Aktiv – keine Maßnahme/Akzeptanz
      </Badge>
    )
  }
  if (risk.accepted_with_rationale) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Akzeptiert (begründet)
      </Badge>
    )
  }
  if (risk.covered) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Abgedeckt
      </Badge>
    )
  }
  return null
}

function MeasureRow({
  measure,
  userName,
  workstreamName,
  todayIso,
}: {
  measure: RiskMeasure
  userName: Map<string, string>
  workstreamName: Map<string, string>
  todayIso: string
}) {
  const overdue = isOverdue(measure, todayIso)
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm">{measure.title}</span>
        <Badge variant="outline" className="shrink-0 text-[11px]">
          {WORK_ITEM_STATUS_LABELS[measure.status as WorkItemStatus] ??
            measure.status}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {measure.responsible_user_id && (
          <span className="truncate">
            {userName.get(measure.responsible_user_id) ?? "—"}
          </span>
        )}
        {measure.workstream_id && (
          <span className="truncate">
            {workstreamName.get(measure.workstream_id) ?? "—"}
          </span>
        )}
        {measure.due_date && (
          <span className={overdue ? "font-medium text-destructive" : ""}>
            {measure.due_date}
          </span>
        )}
      </div>
    </li>
  )
}

function RiskCard({
  risk,
  userName,
  workstreamName,
  todayIso,
}: {
  risk: RiskMeasureRow
  userName: Map<string, string>
  workstreamName: Map<string, string>
  todayIso: string
}) {
  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{risk.title}</CardTitle>
          <Badge
            variant="outline"
            className={riskSeverityBadgeTone(risk.score)}
          >
            {risk.probability}×{risk.impact} = {risk.score}
          </Badge>
          <Badge variant="secondary">
            {RISK_STATUS_LABELS[risk.status as RiskStatus] ?? risk.status}
          </Badge>
          <CoverageBadge risk={risk} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            Risiko-Owner:{" "}
            {risk.responsible_user_id
              ? (userName.get(risk.responsible_user_id) ?? "—")
              : "—"}
          </span>
          <span>
            Workstream:{" "}
            {risk.workstream_id
              ? (workstreamName.get(risk.workstream_id) ?? "—")
              : "—"}
          </span>
          <span>
            Maßnahmen: {risk.measure_count}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {risk.measures.length > 0 ? (
          <ul className="space-y-2">
            {risk.measures.map((m) => (
              <MeasureRow
                key={m.id}
                measure={m}
                userName={userName}
                workstreamName={workstreamName}
                todayIso={todayIso}
              />
            ))}
          </ul>
        ) : risk.accepted_with_rationale ? (
          <p className="rounded-md border border-dashed bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Begründete Akzeptanz:{" "}
            </span>
            {risk.mitigation}
          </p>
        ) : (
          <p className="rounded-md border border-dashed bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            Keine Maßnahme verknüpft.
            {risk.active_uncovered &&
              " Aktives Risiko ohne Maßnahme oder begründete Akzeptanz."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

interface Group {
  key: string
  label: string
  risks: RiskMeasureRow[]
  uncovered: number
}

export function MaMeasuresPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { overview, loading, error, refresh } = useRiskMeasureOverview(projectId)
  const { members } = useTenantMembers(currentTenant?.id)
  const { workstreams } = useWorkstreams(projectId)

  const [groupBy, setGroupBy] = React.useState<GroupBy>("risk")

  const todayIso = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  )

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

  const workstreamName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const w of workstreams) m.set(w.id, w.label)
    return m
  }, [workstreams])

  const risks = React.useMemo(() => overview?.risks ?? [], [overview])

  const groups = React.useMemo<Group[]>(() => {
    if (groupBy === "risk") {
      // One group holding all risks (each risk is its own card).
      return [{ key: "all", label: "", risks, uncovered: 0 }]
    }
    const map = new Map<string, RiskMeasureRow[]>()
    for (const r of risks) {
      const key =
        groupBy === "owner"
          ? (r.responsible_user_id ?? NO_OWNER)
          : (r.workstream_id ?? NO_WORKSTREAM)
      const arr = map.get(key) ?? []
      arr.push(r)
      map.set(key, arr)
    }
    const out: Group[] = []
    for (const [key, arr] of map) {
      let label: string
      if (groupBy === "owner") {
        label =
          key === NO_OWNER ? "Ohne Risiko-Owner" : (userName.get(key) ?? "—")
      } else {
        label =
          key === NO_WORKSTREAM
            ? "Ohne Workstream"
            : (workstreamName.get(key) ?? "—")
      }
      out.push({
        key,
        label,
        risks: arr,
        uncovered: arr.filter((r) => r.active_uncovered).length,
      })
    }
    // Stable: groups with uncovered risks first, then by label.
    out.sort(
      (a, b) => b.uncovered - a.uncovered || a.label.localeCompare(b.label)
    )
    return out
  }, [groupBy, risks, userName, workstreamName])

  const summary = overview?.summary

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Maßnahmen-Übersicht
          </h1>
          <p className="text-sm text-muted-foreground">
            Maßnahmen (verknüpfte Aufgaben) je Risiko, Risiko-Owner oder
            Workstream. Aktive Risiken ohne Maßnahme oder begründete Akzeptanz
            werden hervorgehoben.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gruppieren:</span>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupBy)}
          >
            <SelectTrigger className="w-[190px]" aria-label="Gruppierung">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="risk">nach Risiko</SelectItem>
              <SelectItem value="owner">nach Risiko-Owner</SelectItem>
              <SelectItem value="workstream">nach Workstream</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {summary &&
        (summary.active_uncovered > 0 ? (
          <div
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
            role="status"
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden
            />
            <span>
              <span className="font-semibold text-destructive">
                {summary.active_uncovered}
              </span>{" "}
              von {summary.active_total} aktiven Risiken ohne Maßnahme oder
              begründete Akzeptanz.
            </span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm"
            role="status"
          >
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden
            />
            <span>
              Alle {summary.active_total} aktiven Risiken sind abgedeckt.
            </span>
          </div>
        ))}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Lade Maßnahmen-Übersicht …
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
      ) : risks.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
          Noch keine Risiken in diesem Projekt.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="space-y-3">
              {group.label && (
                <div className="flex items-center gap-2 border-b pb-1">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {group.risks.length} Risiko
                    {group.risks.length === 1 ? "" : "s"}
                  </span>
                  {group.uncovered > 0 && (
                    <Badge variant="destructive" className="text-[11px]">
                      {group.uncovered} ungedeckt
                    </Badge>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {group.risks.map((risk) => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    userName={userName}
                    workstreamName={workstreamName}
                    todayIso={todayIso}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
