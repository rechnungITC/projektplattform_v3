"use client"

import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Flag,
  GitPullRequest,
  ListChecks,
} from "lucide-react"

import { Progress } from "@/components/ui/progress"
import type { ReleaseHealthSummary } from "@/types/release"

interface ReleaseHealthStripProps {
  health: ReleaseHealthSummary
}

function percent(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

export function ReleaseHealthStrip({ health }: ReleaseHealthStripProps) {
  const donePercent = percent(health.done_items, health.total_items)
  const metrics = [
    {
      label: "Scope",
      value: `${health.done_items}/${health.total_items}`,
      icon: ListChecks,
    },
    {
      label: "Sprints",
      value: health.contributing_sprints.toString(),
      icon: GitPullRequest,
    },
    {
      label: "Blockiert",
      value: health.blocked_items.toString(),
      icon: AlertTriangle,
    },
    {
      label: "Außerhalb",
      value: health.outside_window_items.toString(),
      icon: Flag,
    },
    {
      label: "Überfällig",
      value: health.overdue_items.toString(),
      icon: CircleSlash,
    },
    {
      label: "Fertig",
      value: `${donePercent}%`,
      icon: CheckCircle2,
    },
  ]

  return (
    <section aria-label="Release Health" className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <div
              key={metric.label}
              className="rounded-md border bg-card px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{metric.label}</span>
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {metric.value}
              </div>
            </div>
          )
        })}
      </div>
      <Progress value={donePercent} className="h-2" />
    </section>
  )
}
