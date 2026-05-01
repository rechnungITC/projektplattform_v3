"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useProject } from "@/hooks/use-project"
import { getMethodConfig } from "@/lib/method-templates"
import {
  filterSectionsByModules,
  getProjectSectionHref,
  isSectionActive,
} from "@/lib/method-templates/routing"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import { cn } from "@/lib/utils"

const PROJECT_SIDEBAR_COOKIE = "sidebar.project.mode"
const PROJECT_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 1 week

type ProjectSidebarMode = "expanded" | "collapsed"

interface ProjectSidebarProps {
  projectId: string
  /** Initial mode read server-side from cookie, prevents layout shift. */
  initialMode: ProjectSidebarMode
}

/**
 * PROJ-23 — project-room vertical sidebar.
 *
 * PROJ-28: sections are now driven by the active project method via
 * `MethodConfig.sidebarSections` instead of a hardcoded TABS list.
 * Labels (Phasen vs Releases vs Backlog) and URL slugs (arbeitspakete
 * vs backlog) adapt per method; module-gating (PROJ-17) flows through
 * `SidebarSection.requiresModule`.
 *
 * Custom-built (not shadcn-Sidebar) to avoid Context conflicts with the
 * GlobalSidebar's SidebarProvider. State is local + cookie-persisted.
 * Hotkey Ctrl/Cmd+Shift+B toggles.
 *
 * On viewports ≤ 768 px, this component renders nothing — the
 * `ProjectRoomShell` renders a method-aware horizontal strip instead.
 */
export function ProjectSidebar({
  projectId,
  initialMode,
}: ProjectSidebarProps) {
  const pathname = usePathname() ?? ""
  const { tenantSettings } = useAuth()
  const { project } = useProject(projectId)
  const method = useCurrentProjectMethod(projectId)
  const [mode, setMode] = React.useState<ProjectSidebarMode>(initialMode)

  const writeCookie = React.useCallback((next: ProjectSidebarMode) => {
    if (typeof document === "undefined") return
    document.cookie = `${PROJECT_SIDEBAR_COOKIE}=${next}; path=/; max-age=${PROJECT_SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
  }, [])

  const toggle = React.useCallback(() => {
    setMode((prev) => {
      const next: ProjectSidebarMode = prev === "expanded" ? "collapsed" : "expanded"
      writeCookie(next)
      return next
    })
  }, [writeCookie])

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [toggle])

  const config = getMethodConfig(method)
  const visibleSections = React.useMemo(
    () => filterSectionsByModules(config.sidebarSections, tenantSettings),
    [config.sidebarSections, tenantSettings]
  )

  const isCollapsed = mode === "collapsed"
  const projectName = project?.name ?? "Projekt"

  return (
    <aside
      aria-label="Project sections"
      className={cn(
        "hidden shrink-0 flex-col border-r bg-background md:flex",
        isCollapsed ? "w-14" : "w-[200px]"
      )}
      data-state={mode}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b p-2",
          isCollapsed && "justify-center"
        )}
      >
        {isCollapsed ? null : (
          <div className="min-w-0 flex-1 px-2">
            <p className="truncate text-xs font-medium text-muted-foreground">
              Projekt
            </p>
            <p className="truncate text-sm font-semibold">{projectName}</p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={
            isCollapsed
              ? "Project-Sidebar ausklappen (⇧⌘B)"
              : "Project-Sidebar einklappen (⇧⌘B)"
          }
          className="h-7 w-7"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-1">
        <ul className="space-y-0.5">
          {visibleSections.map((section) => {
            const active = isSectionActive(pathname, projectId, section.id, method)
            const href = getProjectSectionHref(projectId, section.id, method)
            const Icon = section.icon
            const inner = (
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  isCollapsed && "justify-center"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {isCollapsed ? null : <span className="truncate">{section.label}</span>}
              </Link>
            )
            return (
              <li key={section.id}>
                {isCollapsed ? (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>{inner}</TooltipTrigger>
                    <TooltipContent side="right">{section.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
