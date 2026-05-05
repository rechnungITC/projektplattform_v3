"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { WorkItemWithProfile } from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"

/**
 * PROJ-25b — drag-overlay payload.
 *
 * - 1 item  → single ghost card
 * - 2 items → two stacked cards (slight rotation)
 * - 3+ items → three stacked cards + "+(N − 3) more" badge
 *
 * Aria-hidden: the screen-reader narrative comes from the BacklogDndProvider's
 * aria-live region, not from this visual artifact.
 */
interface DragOverlayCardProps {
  items: WorkItemWithProfile[]
}

const STACK_RENDER_LIMIT = 3

export function DragOverlayCard({ items }: DragOverlayCardProps) {
  if (items.length === 0) return null
  const visible = items.slice(0, STACK_RENDER_LIMIT)
  const hiddenCount = items.length - visible.length

  return (
    <div
      className="pointer-events-none relative"
      aria-hidden
      style={{ width: 320 }}
    >
      {visible.map((item, idx) => (
        <Card
          key={item.id}
          className={cn(
            "absolute left-0 top-0 w-full bg-background/95 shadow-lg backdrop-blur",
            // Stack rotation — subtle for readability, distinct enough to feel
            // like a stack. Only applied when there's more than one card.
            visible.length > 1 && idx === 0 && "rotate-[-2deg]",
            visible.length > 1 && idx === 1 && "rotate-[1.5deg]",
            visible.length > 2 && idx === 2 && "rotate-[3deg]",
          )}
          style={{
            // Each layer offsets a few pixels for the depth effect.
            transform: `translate(${idx * 4}px, ${idx * 4}px)`,
            zIndex: STACK_RENDER_LIMIT - idx,
          }}
        >
          <CardContent className="space-y-1 p-3">
            <div className="flex items-center gap-2">
              <WorkItemKindBadge kind={item.kind} />
              <span className="truncate text-sm font-medium">{item.title}</span>
            </div>
          </CardContent>
        </Card>
      ))}
      {/* The visible stack only has up-to-3 cards; the badge shows total count
          when more were dragged. Reserve a card-height of vertical space below
          the stack so the page-layout stays intact in the overlay. */}
      <div
        style={{
          height:
            visible.length > 1
              ? `calc(${visible.length * 4}px + 5rem)`
              : "5rem",
        }}
      />
      {items.length > 1 ? (
        <Badge
          variant="secondary"
          className="absolute -right-2 -top-2 z-10 shadow"
        >
          {hiddenCount > 0 ? `+${items.length}` : `${items.length}`}{" "}
          {items.length === 1 ? "Story" : "Stories"}
        </Badge>
      ) : null}
    </div>
  )
}
