"use client"

import {
  ClipboardList,
  History,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
  Users,
  Users2,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { cn } from "@/lib/utils"

interface ProjectRoomShellProps {
  projectId: string
  children: React.ReactNode
}

interface ProjectTab {
  segment: "" | "planung" | "backlog" | "stakeholder" | "mitglieder" | "historie" | "einstellungen"
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const TABS: readonly ProjectTab[] = [
  { segment: "", label: "Übersicht", icon: LayoutDashboard },
  { segment: "planung", label: "Planung", icon: ClipboardList },
  { segment: "backlog", label: "Backlog", icon: ListTodo },
  { segment: "stakeholder", label: "Stakeholder", icon: Users },
  { segment: "mitglieder", label: "Mitglieder", icon: Users2 },
  { segment: "historie", label: "Historie", icon: History },
  { segment: "einstellungen", label: "Einstellungen", icon: SettingsIcon },
] as const

export function ProjectRoomShell({
  projectId,
  children,
}: ProjectRoomShellProps) {
  const pathname = usePathname() ?? ""
  const base = `/projects/${projectId}`

  function isActive(segment: ProjectTab["segment"]): boolean {
    if (segment === "") {
      // Übersicht: only active when we're at the bare project page.
      return pathname === base
    }
    const tabPath = `${base}/${segment}`
    return pathname === tabPath || pathname.startsWith(`${tabPath}/`)
  }

  return (
    <div className="flex flex-col">
      <nav
        aria-label="Project sections"
        className="sticky top-14 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto py-2">
            {TABS.map((tab) => {
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
