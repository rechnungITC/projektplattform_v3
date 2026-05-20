"use client"

/**
 * PROJ-65 ε.1 — TrajectoryGraph3D.
 *
 * Reuses the existing PROJ-58 `ProjectGraph3DCanvas` scene (three.js
 * + react-three-fiber) with the trajectory snapshot. The trajectory-
 * specific projection (x=time, y=lane, z=depth) is deferred to a
 * follow-up slice; ε.1 ships an honest "3D Beta" badge so users
 * know what they're seeing today.
 *
 * Dynamic-imported by parent (`next/dynamic`, `ssr:false`) to respect
 * the L9 bundle budget on `/projects/[id]/graph`.
 */

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { ProjectGraph3DCanvas } from "@/components/projects/project-graph-3d-canvas"
import type { ProjectGraphSnapshot } from "@/lib/project-graph/types"

interface TrajectoryGraph3DProps {
  snapshot: ProjectGraphSnapshot
  focusedNodeId: string | null
  onFocusNode: (nodeId: string | null) => void
}

export function TrajectoryGraph3D({
  snapshot,
  focusedNodeId,
  onFocusNode,
}: TrajectoryGraph3DProps) {
  const [resetTick, setResetTick] = React.useState(0)
  return (
    <div
      className="relative"
      data-testid="trajectory-graph-3d"
    >
      <Badge
        variant="outline"
        className="absolute right-2 top-2 z-10 bg-card/80 text-[10px]"
      >
        3D · Beta
      </Badge>
      <ProjectGraph3DCanvas
        snapshot={snapshot}
        criticalOverlay={false}
        focusedNodeId={focusedNodeId}
        focusedEdgeId={null}
        resetTick={resetTick}
        onFocusNode={onFocusNode}
        onFocusEdge={() => setResetTick((t) => t + 1)}
      />
    </div>
  )
}
