"use client"

import * as React from "react"

import { ProjectRoomShell } from "@/components/projects/project-room-shell"
import { useProject } from "@/hooks/use-project"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import { getMethodConfig } from "@/lib/method-templates"

import { MethodHeader } from "./method-header"
import { MethodSidebar } from "./method-sidebar"

interface ProjectRoomLayoutProps {
  projectId: string
  children: React.ReactNode
}

/**
 * Method-aware Project Room layout (PROJ-7).
 *
 * Wraps the existing PROJ-4 horizontal tab nav with:
 * - a left method-sidebar (collapsible on desktop, sheet on mobile)
 * - a top method-header (sprint selector / phase bar / simple banner)
 *
 * The component is a client component because the sidebar reads
 * `usePathname()` and persists collapse state in `localStorage`. The
 * underlying project access check still happens in the server-side
 * `layout.tsx`.
 */
export function ProjectRoomLayout({
  projectId,
  children,
}: ProjectRoomLayoutProps) {
  const method = useCurrentProjectMethod(projectId)
  const config = React.useMemo(() => getMethodConfig(method), [method])
  const { project } = useProject(projectId)

  // While the project loads, render the chrome with placeholders. The
  // server layout already validated existence, so we don't need a
  // notFound branch here.
  const projectName = project?.name ?? "Projekt"
  const lifecycleStatus = project?.lifecycle_status

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-background text-on-surface">
      <MethodSidebar config={config} projectId={projectId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MethodHeader
          config={config}
          projectId={projectId}
          projectName={projectName}
          lifecycleStatus={lifecycleStatus}
        />
        <ProjectRoomShell projectId={projectId}>{children}</ProjectRoomShell>
      </div>
    </div>
  )
}
