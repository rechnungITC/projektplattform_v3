"use client"

import Link from "next/link"

import { TenantSwitcher } from "@/components/app/tenant-switcher"
import { UserMenu } from "@/components/app/user-menu"

export function TopNav() {
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

        <div className="flex-1" aria-hidden />

        <div className="flex items-center gap-2">
          <TenantSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
