"use client"

/**
 * PROJ-65 ε.2 — StakeholderDetailPanel (FE-5, FE-6, FE-7, FE-8, FE-15, FE-16).
 *
 * Right-side Sheet showing assignees of a focused trajectory node.
 * Renders rates with Class-3 masking (server-driven) + a permission
 * lock-glyph in the header. Action footer launches the SwapDialog.
 */

import { AlertTriangle, Euro, Repeat, UserPlus } from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { NodeAssignee } from "@/lib/project-graph/types"

import {
  ClassThreeFootnote,
  ClassThreeLock,
} from "./class-three-lock"
import { formatRate, type RateValue } from "./cost-delta-formatter"

interface StakeholderDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeLabel: string
  /** WBS / phase / sprint name for the subtitle. Optional. */
  nodeSubtitle?: string | null
  assignees: NodeAssignee[]
  /** Server-driven flag — UI surfaces it via lock glyph + footnote. */
  costClearView: boolean
  /** True when the current user has project-editor permission. */
  canEdit?: boolean
  projectId: string
  onRequestSwap: () => void
  /** Optional initial focus inside the list (set when marker-click rather than overflow-click). */
  focusAssigneeId?: string | null
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function rateValueFor(_assignee: NodeAssignee, clearView: boolean): RateValue {
  // ε.2 ships without exact rate plumbing (PROJ-54 override rates land
  // in a follow-up slice). Until then: show masked placeholder, unless
  // server has explicitly opted-in via clearView (still placeholder
  // because no plaintext rate field exists on `NodeAssignee` yet).
  return { kind: clearView ? "masked" : "masked" }
}

export function StakeholderDetailPanel({
  open,
  onOpenChange,
  nodeLabel,
  nodeSubtitle,
  assignees,
  costClearView,
  canEdit = true,
  projectId,
  onRequestSwap,
  focusAssigneeId,
}: StakeholderDetailPanelProps) {
  const ordered = React.useMemo(() => {
    if (!focusAssigneeId) return assignees
    const hit = assignees.find((a) => a.resource_id === focusAssigneeId)
    if (!hit) return assignees
    return [hit, ...assignees.filter((a) => a !== hit)]
  }, [assignees, focusAssigneeId])

  const hasMasked = ordered.some(
    (a) => rateValueFor(a, costClearView).kind === "masked",
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md"
        data-testid="stakeholder-detail-panel"
      >
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="truncate">{nodeLabel}</SheetTitle>
              {nodeSubtitle && (
                <SheetDescription className="truncate">
                  {nodeSubtitle}
                </SheetDescription>
              )}
            </div>
            <ClassThreeLock clearView={costClearView} />
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        <div
          className="text-xs text-muted-foreground"
          aria-live="polite"
        >
          Zuständig ({ordered.length})
        </div>

        <ScrollArea className="mt-2 h-[calc(100dvh-260px)] pr-2">
          {ordered.length === 0 && (
            <div
              className="rounded-md border border-dashed bg-muted/30 p-4 text-center"
              data-testid="stakeholder-detail-empty"
            >
              <UserPlus className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">Keine Zuweisung</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Diesem Knoten ist noch niemand zugewiesen.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled
                title="Zuweisung folgt in einem Folge-Slice"
              >
                Zuweisen (Next)
              </Button>
            </div>
          )}

          <ul className="space-y-3">
            {ordered.map((a) => {
              const rate = rateValueFor(a, costClearView)
              const greyed = Boolean(a.deleted_at)
              return (
                <li
                  key={`${a.work_item_id}:${a.resource_id}`}
                  className={`rounded-md border p-3 ${greyed ? "opacity-60" : "bg-card"}`}
                  data-testid="stakeholder-detail-row"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-slate-500 text-xs font-semibold text-white">
                        {initials(a.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{a.name}</p>
                        {a.is_critical && (
                          <Badge
                            variant="destructive"
                            className="gap-1 text-[10px]"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            kritisch
                          </Badge>
                        )}
                        {a.is_cost_flagged && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-400 text-amber-700 text-[10px] dark:text-amber-300"
                          >
                            <Euro className="h-2.5 w-2.5" />
                            kostenkritisch
                          </Badge>
                        )}
                        {a.is_positive && (
                          <Badge
                            variant="outline"
                            className="border-primary/40 text-primary text-[10px]"
                          >
                            positiv
                          </Badge>
                        )}
                        {greyed && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            nicht mehr verfügbar
                          </Badge>
                        )}
                      </div>
                      {a.role && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {a.role}
                        </p>
                      )}
                      <p className="mt-1 text-xs">
                        Rate: <span className="font-mono">{formatRate(rate)}</span>
                      </p>
                      {typeof a.allocation_pct === "number" && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] text-muted-foreground">
                            Auslastung {Math.round(a.allocation_pct)}%
                          </p>
                          <Progress
                            value={Math.min(100, Math.max(0, a.allocation_pct))}
                            className="h-1.5"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-4">
            <ClassThreeFootnote
              hasMaskedValue={hasMasked}
              projectId={projectId}
            />
          </div>
        </ScrollArea>

        <SheetFooter className="flex flex-row items-center justify-between pt-4">
          <p className="text-[11px] text-muted-foreground">
            Übernahme folgt in ε.3 (Live-Propagation).
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onRequestSwap}
            disabled={!canEdit || ordered.length === 0}
            data-testid="stakeholder-detail-swap-button"
            title={
              canEdit
                ? "Stakeholder-Wechsel simulieren"
                : "Bearbeiten erfordert Projekt-Editor-Rolle"
            }
          >
            <Repeat className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Stakeholder wechseln
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
