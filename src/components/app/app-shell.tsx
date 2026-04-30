"use client"

import { usePathname } from "next/navigation"
import * as React from "react"

import { GlobalSidebar } from "@/components/app/global-sidebar"
import { ProjectSidebar } from "@/components/app/project-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

const PROJECT_PATH_REGEX =
  /^\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i

interface AppShellProps {
  /** Initial cookie read in the server layout for both sidebars. */
  globalSidebarOpen: boolean
  projectSidebarMode: "expanded" | "collapsed"
  operationMode?: "shared" | "standalone"
  children: React.ReactNode
}

/**
 * PROJ-23 — combined app shell.
 *
 * Wraps everything authenticated in the GlobalSidebar (shadcn-Sidebar +
 * cookie persistence) and conditionally renders the ProjectSidebar when
 * the current pathname matches `/projects/[uuid]/...`.
 *
 * The horizontal project-tab strip in `project-room-shell.tsx` is kept
 * for mobile (`md:hidden`); ProjectSidebar itself only renders on
 * `md:flex` upwards.
 */
export function AppShell({
  globalSidebarOpen,
  projectSidebarMode,
  operationMode,
  children,
}: AppShellProps) {
  const pathname = usePathname() ?? ""
  const projectMatch = pathname.match(PROJECT_PATH_REGEX)
  const projectId = projectMatch?.[1] ?? null

  return (
    <SidebarProvider defaultOpen={globalSidebarOpen}>
      <GlobalSidebar operationMode={operationMode} />
      <SidebarInset>
        <div className="flex min-h-svh">
          {projectId ? (
            <ProjectSidebar
              projectId={projectId}
              initialMode={projectSidebarMode}
            />
          ) : null}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
