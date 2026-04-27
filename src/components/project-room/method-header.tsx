"use client"

import { Activity, BarChart3, Clipboard } from "lucide-react"
import * as React from "react"

import { LifecycleBadge } from "@/components/projects/lifecycle-badge"
import { PhasesTimeline } from "@/components/phases/phases-timeline"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { usePhases } from "@/hooks/use-phases"
import { useSprints } from "@/hooks/use-sprints"
import { cn } from "@/lib/utils"
import type { MethodConfig } from "@/types/method-config"
import type { LifecycleStatus } from "@/types/project"

interface MethodHeaderProps {
  config: MethodConfig
  projectId: string
  projectName: string
  lifecycleStatus?: LifecycleStatus
}

/**
 * Method-aware top header rendered above the existing tab nav.
 *
 * - Scrum / SAFe: sprint dropdown + Sprint-Planning / Burndown buttons
 *   (button targets are stubbed for V1).
 * - PMI / Waterfall: phase timeline.
 * - Kanban / general: simple banner with project name + status.
 */
export function MethodHeader({
  config,
  projectId,
  projectName,
  lifecycleStatus,
}: MethodHeaderProps) {
  if (config.topHeaderMode === "sprint-selector") {
    return (
      <SprintHeader
        projectId={projectId}
        projectName={projectName}
        lifecycleStatus={lifecycleStatus}
      />
    )
  }
  if (config.topHeaderMode === "phase-bar") {
    return (
      <PhaseHeader
        projectId={projectId}
        projectName={projectName}
        lifecycleStatus={lifecycleStatus}
      />
    )
  }
  return (
    <SimpleHeader
      projectName={projectName}
      lifecycleStatus={lifecycleStatus}
      methodLabel={config.label}
    />
  )
}

function SprintHeader({
  projectId,
  projectName,
  lifecycleStatus,
}: {
  projectId: string
  projectName: string
  lifecycleStatus?: LifecycleStatus
}) {
  const { sprints, loading } = useSprints(projectId)
  // Pin the active sprint when present; otherwise the most recent.
  const initial = React.useMemo(() => {
    const active = sprints.find((s) => s.state === "active")
    return active?.id ?? sprints[0]?.id ?? null
  }, [sprints])
  const [selected, setSelected] = React.useState<string | null>(initial)

  React.useEffect(() => {
    setSelected(initial)
  }, [initial])

  return (
    <HeaderShell>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-h3 font-semibold text-on-surface">
            {projectName}
          </p>
          {lifecycleStatus ? (
            <div className="mt-1">
              <LifecycleBadge status={lifecycleStatus} />
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {loading ? (
            <Skeleton className="h-9 w-44" />
          ) : (
            <Select
              value={selected ?? undefined}
              onValueChange={(v) => setSelected(v)}
              disabled={sprints.length === 0}
            >
              <SelectTrigger
                className="h-9 min-w-44 border-outline-variant bg-surface-container text-on-surface"
                aria-label="Sprint wählen"
              >
                <SelectValue placeholder="Kein Sprint" />
              </SelectTrigger>
              <SelectContent>
                {sprints.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-on-surface-variant">
                    Noch keine Sprints
                  </div>
                ) : (
                  sprints.map((sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id}>
                      <span className="flex items-center gap-2">
                        <span>{sprint.name}</span>
                        {sprint.state === "active" ? (
                          <span className="rounded-full bg-primary-container px-1.5 py-0.5 text-[10px] font-semibold text-on-primary-container">
                            aktiv
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Kommt im Sprint-Planning-Sub-Feature"
          >
            <Clipboard className="mr-1 h-4 w-4" aria-hidden />
            Sprint-Planning
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Kommt im Velocity-Sub-Feature"
          >
            <BarChart3 className="mr-1 h-4 w-4" aria-hidden />
            Burndown
          </Button>
        </div>
      </div>
    </HeaderShell>
  )
}

function PhaseHeader({
  projectId,
  projectName,
  lifecycleStatus,
}: {
  projectId: string
  projectName: string
  lifecycleStatus?: LifecycleStatus
}) {
  const { phases, loading } = usePhases(projectId)
  return (
    <HeaderShell>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-h3 font-semibold text-on-surface">
              {projectName}
            </p>
            {lifecycleStatus ? (
              <div className="mt-1">
                <LifecycleBadge status={lifecycleStatus} />
              </div>
            ) : null}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <PhasesTimeline phases={phases} />
        )}
      </div>
    </HeaderShell>
  )
}

function SimpleHeader({
  projectName,
  lifecycleStatus,
  methodLabel,
}: {
  projectName: string
  lifecycleStatus?: LifecycleStatus
  methodLabel: string
}) {
  return (
    <HeaderShell>
      <div className="flex flex-wrap items-center gap-3">
        <Activity className="h-5 w-5 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-h3 font-semibold text-on-surface">
            {projectName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-on-surface-variant">
              {methodLabel}
            </span>
            {lifecycleStatus ? (
              <LifecycleBadge status={lifecycleStatus} />
            ) : null}
          </div>
        </div>
      </div>
    </HeaderShell>
  )
}

function HeaderShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-b border-outline-variant bg-surface-container-low px-4 py-3 sm:px-6",
        className
      )}
    >
      {children}
    </div>
  )
}
