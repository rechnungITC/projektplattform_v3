"use client"

import * as React from "react"

import { ProjectRoomShell } from "@/components/projects/project-room-shell"

interface ProjectRoomLayoutProps {
  projectId: string
  children: React.ReactNode
}

/**
 * Project Room layout — slimmed down for PROJ-23.
 *
 * The PROJ-7 MethodSidebar (Sprint-Switcher, Swimlane-Filter) and
 * MethodHeader (project name + sprint selector banner) are intentionally
 * not rendered here for now — the user explicitly asked for a clean
 * black-on-white project area without the M3-tinted chrome. The
 * components themselves still live under `src/components/project-room/`
 * and can be re-introduced surgically per page once the UX direction is
 * settled.
 *
 * The new ProjectSidebar in <AppShell> already shows the project name +
 * lifecycle hints, so we don't lose orientation by removing the banner.
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
