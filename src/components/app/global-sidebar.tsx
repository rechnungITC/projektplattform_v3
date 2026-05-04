"use client"

import {
  BarChart3,
  Building2,
  CheckSquare,
  ChevronRight,
  Coins,
  Database,
  FolderKanban,
  Gauge,
  Globe2,
  KeyRound,
  Plug,
  Settings,
  User,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { TenantLogo } from "@/components/app/tenant-logo"
import { TenantSwitcher } from "@/components/app/tenant-switcher"
import { UserMenu } from "@/components/app/user-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
  /**
   * Optional sub-items rendered as a collapsible flyout below the parent.
   * Parent's href is the default destination when the user clicks the label
   * (the chevron toggles the sub-list independently).
   */
  children?: ReadonlyArray<NavSubItem>
}

interface NavSubItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  exact?: boolean
}

const SETTINGS_CHILDREN: readonly NavSubItem[] = [
  { href: "/settings/profile", label: "Profil", icon: User },
  {
    href: "/settings/tenant",
    label: "Workspace",
    icon: Building2,
    adminOnly: true,
    exact: true,
  },
  {
    href: "/settings/tenant/role-rates",
    label: "Tagessätze",
    icon: Coins,
    adminOnly: true,
  },
  {
    href: "/settings/tenant/fx-rates",
    label: "FX-Raten",
    icon: Globe2,
    adminOnly: true,
  },
  {
    href: "/settings/tenant/risk-score",
    label: "Risk-Score",
    icon: Gauge,
    adminOnly: true,
  },
  {
    href: "/settings/tenant/ai-providers",
    label: "AI-Provider",
    icon: KeyRound,
    adminOnly: true,
  },
  { href: "/settings/members", label: "Mitglieder", icon: Users },
] as const

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
  { href: "/approvals", label: "Genehmigungen", icon: CheckSquare },
  { href: "/stammdaten", label: "Stammdaten", icon: Database },
  { href: "/konnektoren", label: "Konnektoren", icon: Plug, adminOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  {
    href: "/settings/profile",
    label: "Einstellungen",
    icon: Settings,
    match: (pathname) => pathname.startsWith("/settings"),
    children: SETTINGS_CHILDREN,
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

              // Item without children: simple Link.
              if (!item.children || item.children.length === 0) {
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
              }

              // Item with children: collapsible group, default-open when
              // any child path is active.
              return (
                <NavCollapsibleItem
                  key={item.href}
                  item={item}
                  active={active}
                  pathname={pathname}
                  currentRole={currentRole}
                />
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

interface NavCollapsibleItemProps {
  item: NavItem
  active: boolean
  pathname: string
  currentRole: string | null
}

function NavCollapsibleItem({
  item,
  active,
  pathname,
  currentRole,
}: NavCollapsibleItemProps) {
  const Icon = item.icon
  const children = item.children ?? []

  const visibleChildren = children.filter(
    (c) => !c.adminOnly || currentRole === "admin",
  )

  // Default-open when the parent route is active. User can toggle via the
  // chevron; once toggled, the override sticks. Pure derivation (no
  // useEffect) keeps `react-hooks/set-state-in-effect` happy.
  const [userOverride, setUserOverride] = React.useState<boolean | null>(null)
  const open = userOverride !== null ? userOverride : active
  const setOpen = (next: boolean) => setUserOverride(next)

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.label}
          className="pr-8"
        >
          <Link href={item.href} aria-current={active ? "page" : undefined}>
            <Icon className="h-4 w-4" aria-hidden />
            <span className="flex-1">{item.label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger
          aria-label={open ? `${item.label} einklappen` : `${item.label} ausklappen`}
          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:rotate-90 transition-transform"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {visibleChildren.map((child) => {
              const ChildIcon = child.icon
              const childActive = child.exact
                ? pathname === child.href
                : pathname === child.href ||
                  pathname.startsWith(`${child.href}/`)
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      href={child.href}
                      aria-current={childActive ? "page" : undefined}
                    >
                      <ChildIcon className="h-3.5 w-3.5" aria-hidden />
                      <span>{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}
