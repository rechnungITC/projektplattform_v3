"use client"

/**
 * PROJ-65 ε.1 — GraphShell (L10).
 *
 * Mode-Toggle wrapper over PROJ-58 `ProjectGraphView` ("Beziehungen")
 * and the new `TrajectoryGraphView` ("Trajektorie"). Holds the mode
 * state and resolves the initial value from URL → localStorage →
 * tenant default (`'relationship'`).
 *
 * Each slot view fetches its own snapshot (relationship without
 * `?include=trajectory`, trajectory with). Per L13 a switched mode
 * does not also keep the previous mode's data alive — single fetch
 * per active mode.
 */

import { GitBranch, Route as RouteIcon } from "lucide-react"
import * as React from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ProjectGraphView } from "@/components/projects/project-graph-view"
import { TrajectoryGraphView } from "@/components/projects/trajectory-graph-view"

export type GraphMode = "relationship" | "trajectory"

interface GraphShellProps {
  projectId: string
  /** Server-passed default from `tenant_settings.graph_mode_default`. */
  defaultMode?: GraphMode
}

const STORAGE_PREFIX = "pp-v3:graph-mode:"

function readUrlMode(): GraphMode | null {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  // PROJ-70-ε — the AI Backlog drawer lives in the Trajektorie view, so a
  // `?aiDrawer=…` deep-link (from the wizard handoff) forces that mode.
  if (params.get("aiDrawer")) return "trajectory"
  const value = params.get("mode")
  if (value === "relationship" || value === "trajectory") return value
  return null
}

function readStorageMode(projectId: string): GraphMode | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`)
    if (value === "relationship" || value === "trajectory") return value
  } catch {
    /* ignore */
  }
  return null
}

function writeStorageMode(projectId: string, mode: GraphMode): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, mode)
  } catch {
    /* ignore */
  }
}

export function GraphShell({ projectId, defaultMode }: GraphShellProps) {
  const [mode, setMode] = React.useState<GraphMode>(defaultMode ?? "relationship")
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    const resolved =
      readUrlMode() ??
      readStorageMode(projectId) ??
      defaultMode ??
      "relationship"
    setMode(resolved)
    setHydrated(true)
  }, [projectId, defaultMode])

  const onModeChange = React.useCallback(
    (next: string) => {
      if (next !== "relationship" && next !== "trajectory") return
      setMode(next)
      writeStorageMode(projectId, next)
    },
    [projectId],
  )

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
        data-testid="graph-shell-toolbar"
      >
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(value) => {
            if (value) onModeChange(value)
          }}
          aria-label="Graph-Modus"
        >
          <ToggleGroupItem value="relationship" aria-label="Beziehungen">
            <GitBranch className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Beziehungen
          </ToggleGroupItem>
          <ToggleGroupItem value="trajectory" aria-label="Trajektorie">
            <RouteIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Trajektorie
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {mode === "trajectory"
            ? "Methoden-adaptiver Pfad mit Sidetracks"
            : "Knoten-/Kanten-Beziehungen über das Projekt"}
        </p>
      </div>
      {hydrated && mode === "trajectory" ? (
        <TrajectoryGraphView projectId={projectId} />
      ) : (
        <ProjectGraphView projectId={projectId} />
      )}
    </div>
  )
}
