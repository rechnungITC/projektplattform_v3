"use client"

import {
  BarChart3,
  Database,
  FolderKanban,
  Menu,
  Plug,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { TenantSwitcher } from "@/components/app/tenant-switcher"
import { UserMenu } from "@/components/app/user-menu"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
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
    // Treat the dashboard "/" as Projekte too, since /projects is the home.
    match: (pathname) =>
      pathname === "/" ||
      pathname === "/projects" ||
      pathname.startsWith("/projects/"),
  },
  { href: "/stammdaten", label: "Stammdaten", icon: Database },
  { href: "/konnektoren", label: "Konnektoren", icon: Plug, adminOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
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

export function TopNav() {
  const pathname = usePathname() ?? "/"
  const { currentRole } = useAuth()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || currentRole === "admin"
  )

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight"
          aria-label="Projektplattform home"
        >
          Projektplattform
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {visibleItems.map((item) => {
            const active = isActive(item, pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" aria-hidden />

        <div className="flex items-center gap-2">
          <TenantSwitcher />
          <UserMenu />
          {/* Mobile drawer trigger — desktop hides this */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Primary mobile"
                className="mt-4 flex flex-col gap-1"
              >
                {visibleItems.map((item) => {
                  const active = isActive(item, pathname)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
