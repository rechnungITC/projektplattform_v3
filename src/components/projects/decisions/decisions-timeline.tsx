"use client"

import { Gavel } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { Decision } from "@/types/decision"

import { DecisionCard } from "./decision-card"

interface DecisionsTimelineProps {
  /** All decisions for the project (latest + predecessors). Latest revisions
   *  are those with `is_revised === false`; their predecessors are joined in
   *  by walking the supersedes chain. */
  decisions: Decision[]
  onRevise: (d: Decision) => void
}

/**
 * Walks the supersedes chain backwards from each "current" (is_revised=false)
 * decision so each rendered card carries its full predecessor list.
 */
function buildChains(
  decisions: Decision[]
): Array<{ current: Decision; predecessors: Decision[] }> {
  const byId = new Map<string, Decision>()
  for (const d of decisions) byId.set(d.id, d)

  const result: Array<{ current: Decision; predecessors: Decision[] }> = []
  for (const d of decisions) {
    if (d.is_revised) continue
    const predecessors: Decision[] = []
    let cursor = d.supersedes_decision_id
      ? byId.get(d.supersedes_decision_id) ?? null
      : null
    while (cursor) {
      predecessors.push(cursor)
      cursor = cursor.supersedes_decision_id
        ? byId.get(cursor.supersedes_decision_id) ?? null
        : null
    }
    result.push({ current: d, predecessors })
  }

  // Sort newest first
  result.sort(
    (a, b) =>
      new Date(b.current.decided_at).getTime() -
      new Date(a.current.decided_at).getTime()
  )
  return result
}

export function DecisionsTimeline({
  decisions,
  onRevise,
}: DecisionsTimelineProps) {
  const chains = buildChains(decisions)

  if (chains.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Gavel className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Noch keine Entscheidungen geloggt. Klicke auf „+ Entscheidung“ oder
            wandle einen offenen Punkt um.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {chains.map(({ current, predecessors }) => (
        <DecisionCard
          key={current.id}
          decision={current}
          predecessors={predecessors}
          onRevise={onRevise}
        />
      ))}
    </div>
  )
}
