"use client"

import { Clock } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

interface DashboardSectionUnavailableProps {
  title: string
  description?: string
}

/**
 * PROJ-64 — placeholder shown when a dashboard rollup is not yet
 * available. Two cases:
 *
 *  1. The aggregation endpoint is not yet deployed (frontend
 *     ahead of backend) — the whole dashboard renders sections
 *     as `unavailable`.
 *  2. A specific module is disabled or a per-section feature flag
 *     is off — only that section renders this placeholder.
 *
 * AC-9: never imply green/safe. The copy explicitly says the data
 * is not available right now, not that everything is fine.
 */
export function DashboardSectionUnavailable({
  title,
  description,
}: DashboardSectionUnavailableProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <Clock
          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {description ??
              "Diese Übersicht ist in der aktuellen Slice noch nicht aktiviert. Sie erscheint, sobald die Server-Aggregation live ist."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
