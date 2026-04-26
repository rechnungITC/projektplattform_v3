"use client"

import { Building2, User, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/tenant", label: "Tenant", icon: Building2 },
  { href: "/settings/members", label: "Members", icon: Users },
] as const

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5"
    >
      {ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
