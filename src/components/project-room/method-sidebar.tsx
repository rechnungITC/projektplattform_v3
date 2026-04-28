"use client"

import { ChevronLeft, ChevronRight, Menu } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import type { MethodConfig, SidebarSection } from "@/types/method-config"

const COLLAPSED_KEY = "projektplattform.sidebar.collapsed"

interface MethodSidebarProps {
  config: MethodConfig
  projectId: string
}

/**
 * Method-aware left sidebar for the Project Room (PROJ-7).
 *
 * - Desktop (≥768px): static `<aside>`, collapsible to icon-only via a
 *   header toggle. State is persisted in `localStorage` under
 *   `projektplattform.sidebar.collapsed`.
 * - Mobile (<768px): rendered inside a shadcn `Sheet`, triggered by a
 *   hamburger button.
 */
export function MethodSidebar({ config, projectId }: MethodSidebarProps) {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Restore persisted collapse state on mount.
  React.useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(COLLAPSED_KEY)
      if (persisted === "true") setCollapsed(true)
    } catch {
      // localStorage unavailable — fall back to default.
    }
    setHydrated(true)
  }, [])

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  if (isMobile) {
    return (
      <div className="border-b border-outline-variant bg-surface-container-low px-4 py-2 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Sidebar öffnen"
            >
              <Menu className="mr-2 h-4 w-4" aria-hidden />
              {config.label} · Navigation
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 border-outline-variant bg-surface-container-low p-0 text-on-surface"
          >
            <SheetHeader className="border-b border-outline-variant px-4 py-3 text-left">
              <SheetTitle className="text-on-surface">
                {config.label}
              </SheetTitle>
              <p className="text-xs text-on-surface-variant">
                Methoden-Navigation
              </p>
            </SheetHeader>
            <SidebarNav
              projectId={projectId}
              sections={config.sidebarSections}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 border-r border-outline-variant bg-surface-container-low text-on-surface transition-[width] duration-200 ease-out md:flex md:flex-col",
        // Render w-60 on first client render until hydration to keep SSR
        // consistent; once hydrated, honor the persisted preference.
        hydrated && collapsed ? "w-12" : "w-60"
      )}
      aria-label="Projekt-Navigation"
    >
      <div className="flex items-center justify-between border-b border-outline-variant px-3 py-3">
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">
              {config.label}
            </p>
            <p className="truncate text-xs text-on-surface-variant">
              Project Room
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          aria-label={collapsed ? "Sidebar einblenden" : "Sidebar ausblenden"}
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>
      <SidebarNav
        projectId={projectId}
        sections={config.sidebarSections}
        collapsed={collapsed}
      />
    </aside>
  )
}

interface SidebarNavProps {
  projectId: string
  sections: SidebarSection[]
  collapsed: boolean
  onNavigate?: () => void
}

function SidebarNav({
  projectId,
  sections,
  collapsed,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const searchString = searchParams?.toString() ?? ""
  const base = `/projects/${projectId}`

  return (
    <TooltipProvider delayDuration={150}>
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Sektionen">
        <ul className="space-y-0.5 px-2">
          {sections.map((section) => {
            const href = section.tabPath
              ? `${base}/${section.tabPath}`
              : base
            const active = isActiveSection(
              pathname,
              searchString,
              base,
              section.tabPath
            )
            const Icon = section.icon
            const link = (
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed ? (
                  <>
                    <span className="truncate">{section.label}</span>
                    {section.badge ? (
                      <span className="ml-auto rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                        {section.badge}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </Link>
            )
            if (collapsed) {
              return (
                <li key={section.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">
                      {section.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            }
            return <li key={section.id}>{link}</li>
          })}
        </ul>
      </nav>
    </TooltipProvider>
  )
}

function isActiveSection(
  pathname: string,
  search: string,
  base: string,
  tabPath: string
): boolean {
  const [tabPathName, tabQuery] = tabPath.split("?")
  const target = tabPathName ? `${base}/${tabPathName}` : base
  const pathMatches =
    pathname === target || pathname.startsWith(`${target}/`)
  if (!pathMatches) return false

  // Path matches; honor query-string filter so sibling tabs that share the
  // same pathname (e.g. `backlog?view=board` vs `backlog?kind=epic`) only
  // light up when their specific filter is satisfied.
  if (tabQuery) {
    const expected = new URLSearchParams(tabQuery)
    const actual = new URLSearchParams(search)
    for (const [key, value] of expected.entries()) {
      if (actual.get(key) !== value) return false
    }
    return true
  }

  // tabPath has no query → only active when URL has none either, so a
  // bare-path sibling cedes to a more-specific query-string sibling.
  return search === ""
}
