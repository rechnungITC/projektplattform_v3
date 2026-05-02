"use client"

import {
  Building2,
  Coins,
  Gauge,
  Globe2,
  Trash2,
  User,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import type { Role } from "@/types/auth"

interface SettingsTab {
  href: string
  label: string
  icon: typeof User
  /** When set, only roles in this list see the tab. Undefined means visible to all. */
  visibleTo?: readonly Role[]
  /** Optional sub-tabs rendered as indented entries when this tab is active. */
  children?: ReadonlyArray<Omit<SettingsTab, "children">>
}

const TENANT_CHILDREN: ReadonlyArray<Omit<SettingsTab, "children">> = [
  {
    href: "/settings/tenant",
    label: "Allgemein",
    icon: Building2,
    visibleTo: ["admin"],
  },
  {
    href: "/settings/tenant/role-rates",
    label: "Tagessätze",
    icon: Coins,
    visibleTo: ["admin"],
  },
  {
    href: "/settings/tenant/fx-rates",
    label: "FX-Raten",
    icon: Globe2,
    visibleTo: ["admin"],
  },
  {
    href: "/settings/tenant/risk-score",
    label: "Risk-Score",
    icon: Gauge,
    visibleTo: ["admin"],
  },
] as const

const ITEMS: readonly SettingsTab[] = [
  { href: "/settings/profile", label: "Profile", icon: User },
  {
    href: "/settings/tenant",
    label: "Workspace",
    icon: Building2,
    visibleTo: ["admin"],
    children: TENANT_CHILDREN,
  },
  { href: "/settings/members", label: "Members", icon: Users },
  {
    href: "/settings/projects-trash",
    label: "Projects Trash",
    icon: Trash2,
    visibleTo: ["admin"],
  },
] as const

function isActive(pathname: string | null, href: string, exact: boolean): boolean {
  if (!pathname) return false
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SettingsTabs() {
  const pathname = usePathname()
  const { currentRole } = useAuth()

  const visibleItems = ITEMS.filter(
    (item) =>
      !item.visibleTo || (currentRole && item.visibleTo.includes(currentRole)),
  )

  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5"
    >
      {visibleItems.map((item) => {
        const groupActive = isActive(pathname, item.href, false)
        const Icon = item.icon
        const isGroup = item.children && item.children.length > 0

        return (
          <div key={item.href} className="contents">
            {isGroup ? (
              <span
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                  groupActive
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                  groupActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                aria-current={groupActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            )}

            {isGroup && item.children
              ? item.children
                  .filter(
                    (child) =>
                      !child.visibleTo ||
                      (currentRole && child.visibleTo.includes(currentRole)),
                  )
                  .map((child) => {
                    const isAllgemein = child.href === "/settings/tenant"
                    const childActive = isActive(
                      pathname,
                      child.href,
                      isAllgemein, // exact match for /settings/tenant only
                    )
                    const ChildIcon = child.icon
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "ml-4 inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                          childActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                        aria-current={childActive ? "page" : undefined}
                      >
                        <ChildIcon className="h-3.5 w-3.5" aria-hidden />
                        {child.label}
                      </Link>
                    )
                  })
              : null}
          </div>
        )
      })}
    </nav>
  )
}
