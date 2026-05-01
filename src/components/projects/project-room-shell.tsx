"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { useAuth } from "@/hooks/use-auth"
import { getMethodConfig } from "@/lib/method-templates"
import {
  filterSectionsByModules,
  getProjectSectionHref,
  isSectionActive,
} from "@/lib/method-templates/routing"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import { cn } from "@/lib/utils"

interface ProjectRoomShellProps {
  projectId: string
  children: React.ReactNode
}

/**
 * Mobile horizontal tab strip for the Project Room (≤ 767 px).
 *
 * PROJ-28: tabs come from the active method's `MethodConfig
 * .sidebarSections` filtered by tenant modules — same source as the
 * desktop `ProjectSidebar`, so labels and URL slugs stay consistent
 * across viewports.
 *
 * On md+ viewports this nav is hidden and `<AppShell>`'s
 * `ProjectSidebar` takes over.
 */
export function ProjectRoomShell({
  projectId,
  children,
}: ProjectRoomShellProps) {
  const pathname = usePathname() ?? ""
  const { tenantSettings } = useAuth()
  const method = useCurrentProjectMethod(projectId)
  const config = getMethodConfig(method)
  const visibleSections = React.useMemo(
    () => filterSectionsByModules(config.sidebarSections, tenantSettings),
    [config.sidebarSections, tenantSettings]
  )

  return (
    <div className="flex flex-col">
      <nav
        aria-label="Project sections"
        className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
      >
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto py-2">
            {visibleSections.map((section) => {
              const active = isSectionActive(
                pathname,
                projectId,
                section.id,
                method,
              )
              const href = getProjectSectionHref(projectId, section.id, method)
              const Icon = section.icon
              return (
                <li key={section.id}>
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
                    <span>{section.label}</span>
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
