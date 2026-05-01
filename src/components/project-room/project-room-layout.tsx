"use client"

import * as React from "react"

import { ProjectRoomShell } from "@/components/projects/project-room-shell"

interface ProjectRoomLayoutProps {
  projectId: string
  children: React.ReactNode
}

/**
 * Project Room layout.
 *
 * On md+ viewports the desktop `ProjectSidebar` in `<AppShell>` is the
 * primary navigation; this layout only wraps the mobile horizontal tab
 * strip via `ProjectRoomShell` (≤ 767 px).
 *
 * Both the mobile strip and the desktop sidebar are method-aware via
 * `MethodConfig.sidebarSections` (PROJ-28).
 */
export function ProjectRoomLayout({
  projectId,
  children,
}: ProjectRoomLayoutProps) {
  return (
    <div className="min-h-[calc(100svh-0px)] bg-white text-foreground">
      <ProjectRoomShell projectId={projectId}>{children}</ProjectRoomShell>
    </div>
  )
}
