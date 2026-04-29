"use client"

import {
  AlertTriangle,
  ClipboardList,
  Gavel,
  History,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  Users2,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { useAuth } from "@/hooks/use-auth"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import { cn } from "@/lib/utils"
import type { ModuleKey } from "@/types/tenant-settings"

interface ProjectRoomShellProps {
  projectId: string
  children: React.ReactNode
}

interface ProjectTab {
  segment:
    | ""
    | "planung"
    | "backlog"
    | "stakeholder"
    | "risiken"
    | "entscheidungen"
    | "ai-proposals"
    | "mitglieder"
    | "historie"
    | "einstellungen"
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** PROJ-17: hide tab when this module is disabled for the tenant. */
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
  { segment: "mitglieder", label: "Mitglieder", icon: Users2 },
  { segment: "historie", label: "Historie", icon: History },
  { segment: "einstellungen", label: "Einstellungen", icon: SettingsIcon },
] as const

export function ProjectRoomShell({
  projectId,
  children,
}: ProjectRoomShellProps) {
  const pathname = usePathname() ?? ""
  const { tenantSettings } = useAuth()
  const base = `/projects/${projectId}`

  function isActive(segment: ProjectTab["segment"]): boolean {
    if (segment === "") {
      // Übersicht: only active when we're at the bare project page.
      return pathname === base
    }
    const tabPath = `${base}/${segment}`
    return pathname === tabPath || pathname.startsWith(`${tabPath}/`)
  }

  const visibleTabs = TABS.filter(
    (t) => !t.requiresModule || isModuleActive(tenantSettings, t.requiresModule)
  )

  return (
    <div className="flex flex-col">
      <nav
        aria-label="Project sections"
        className="sticky top-14 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto py-2">
            {visibleTabs.map((tab) => {
              const active = isActive(tab.segment)
              const href = tab.segment === "" ? base : `${base}/${tab.segment}`
              const Icon = tab.icon
              return (
                <li key={tab.segment}>
                  <Link
                    href={href}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span>{tab.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
      <div>{children}</div>
    </div>
  )
}
