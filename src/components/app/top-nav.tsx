"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { TenantSwitcher } from "@/components/app/tenant-switcher"
import { UserMenu } from "@/components/app/user-menu"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
] as const

export function TopNav() {
  const pathname = usePathname()

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
          className="hidden items-center gap-1 sm:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" aria-hidden />

        <div className="flex items-center gap-2">
          <TenantSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
