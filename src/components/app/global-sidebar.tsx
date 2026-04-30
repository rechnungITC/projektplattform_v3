"use client"

import {
  BarChart3,
  Database,
  FileSearch,
  FolderKanban,
  Plug,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { TenantLogo } from "@/components/app/tenant-logo"
import { TenantSwitcher } from "@/components/app/tenant-switcher"
import { UserMenu } from "@/components/app/user-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type { ModuleKey } from "@/types/tenant-settings"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  /** PROJ-17: hide nav entry when this module is disabled for the tenant. */
  requiresModule?: ModuleKey
  /**
   * Custom matcher for the active state. By default we use
   * `pathname === href || pathname.startsWith(href + "/")`.
   */
  match?: (pathname: string) => boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/projects",
    label: "Projekte",
    icon: FolderKanban,
    match: (pathname) =>
      pathname === "/" ||
      pathname === "/projects" ||
      pathname.startsWith("/projects/"),
  },
  { href: "/stammdaten", label: "Stammdaten", icon: Database },
  { href: "/konnektoren", label: "Konnektoren", icon: Plug, adminOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  {
    href: "/reports/audit",
    label: "Audit",
    icon: FileSearch,
    adminOnly: true,
    requiresModule: "audit_reports",
  },
  {
    href: "/settings/profile",
    label: "Einstellungen",
    icon: Settings,
    match: (pathname) => pathname.startsWith("/settings"),
  },
] as const

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  if (item.href === "/") return pathname === "/"
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

interface GlobalSidebarProps {
  /** PROJ-3 — passed from the server layout so TenantSwitcher hides itself
   *  in stand-alone mode without needing process.env on the client. */
  operationMode?: "shared" | "standalone"
}

/**
 * PROJ-23 — top-level vertical sidebar. Uses shadcn-Sidebar primitive for
 * cookie persistence + Ctrl/Cmd+B toggle + mobile off-canvas + a11y.
 *
 * NavItems are filtered by RBAC (adminOnly) + by tenant module activation.
 */
export function GlobalSidebar({ operationMode = "shared" }: GlobalSidebarProps) {
  const pathname = usePathname() ?? "/"
  const { currentRole, currentTenant, tenantBranding, tenantSettings } =
    useAuth()

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && currentRole !== "admin") return false
    if (item.requiresModule && !isModuleActive(tenantSettings, item.requiresModule))
      return false
    return true
  })

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <Link
          href="/"
          aria-label="Projektplattform Home"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TenantLogo
            logoUrl={tenantBranding?.logo_url ?? null}
            tenantName={currentTenant?.name ?? null}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visibleItems.map((item) => {
              const active = isActive(item, pathname)
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                  >
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-1 p-1">
          <TenantSwitcher operationMode={operationMode} />
          <UserMenu />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
