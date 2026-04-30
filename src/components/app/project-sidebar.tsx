"use client"

import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gavel,
  History,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  Users2,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useProject } from "@/hooks/use-project"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import { cn } from "@/lib/utils"
import type { ModuleKey } from "@/types/tenant-settings"

const PROJECT_SIDEBAR_COOKIE = "sidebar.project.mode"
const PROJECT_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 1 week

type ProjectSidebarMode = "expanded" | "collapsed"

interface ProjectTab {
  segment: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  requiresModule?: ModuleKey
}

const TABS: readonly ProjectTab[] = [
  { segment: "", label: "Übersicht", icon: LayoutDashboard },
  { segment: "planung", label: "Planung", icon: ClipboardList },
  { segment: "backlog", label: "Backlog", icon: ListTodo },
  { segment: "stakeholder", label: "Stakeholder", icon: Users },
  {
    segment: "risiken",
    label: "Risiken",
    icon: AlertTriangle,
    requiresModule: "risks",
  },
  {
    segment: "entscheidungen",
    label: "Entscheidungen",
    icon: Gavel,
    requiresModule: "decisions",
  },
  {
    segment: "ai-proposals",
    label: "KI-Vorschläge",
    icon: Sparkles,
    requiresModule: "ai_proposals",
  },
  {
    segment: "kommunikation",
    label: "Kommunikation",
    icon: MessageSquare,
    requiresModule: "communication",
  },
  {
    segment: "lieferanten",
    label: "Lieferanten",
    icon: Building2,
    requiresModule: "vendor",
  },
  {
    segment: "budget",
    label: "Budget",
    icon: Wallet,
    requiresModule: "budget",
  },
  { segment: "mitglieder", label: "Mitglieder", icon: Users2 },
  { segment: "historie", label: "Historie", icon: History },
  { segment: "einstellungen", label: "Einstellungen", icon: SettingsIcon },
] as const

interface ProjectSidebarProps {
  projectId: string
  /** Initial mode read server-side from cookie, prevents layout shift. */
  initialMode: ProjectSidebarMode
}

/**
 * PROJ-23 — project-room vertical sidebar.
 *
 * Custom-built (not shadcn-Sidebar) to avoid Context conflicts with the
 * GlobalSidebar's SidebarProvider. State is local + cookie-persisted.
 * Hotkey Ctrl/Cmd+Shift+B toggles.
 *
 * On viewports ≤ 768 px, this component renders nothing — the legacy
 * horizontal tab strip is used instead (handled in `<AppShell>`).
 */
export function ProjectSidebar({
  projectId,
  initialMode,
}: ProjectSidebarProps) {
  const pathname = usePathname() ?? ""
  const { tenantSettings } = useAuth()
  const { project } = useProject(projectId)
  const [mode, setMode] = React.useState<ProjectSidebarMode>(initialMode)
  const base = `/projects/${projectId}`

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

  // Hotkey: Ctrl/Cmd+Shift+B
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

  function isActive(segment: string): boolean {
    if (segment === "") return pathname === base
    const tabPath = `${base}/${segment}`
    return pathname === tabPath || pathname.startsWith(`${tabPath}/`)
  }

  const visibleTabs = TABS.filter(
    (t) => !t.requiresModule || isModuleActive(tenantSettings, t.requiresModule)
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
          {visibleTabs.map((tab) => {
            const active = isActive(tab.segment)
            const href = tab.segment === "" ? base : `${base}/${tab.segment}`
            const Icon = tab.icon
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
                {isCollapsed ? null : <span className="truncate">{tab.label}</span>}
              </Link>
            )
            return (
              <li key={tab.segment}>
                {isCollapsed ? (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>{inner}</TooltipTrigger>
                    <TooltipContent side="right">{tab.label}</TooltipContent>
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
