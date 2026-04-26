"use client"

import { Check, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

export function TenantSwitcher() {
  const { memberships, currentTenant, setCurrentTenant } = useAuth()

  // Hide the switcher if the user belongs to fewer than 2 tenants.
  if (memberships.length < 2) {
    if (!currentTenant) return null
    return (
      <span
        className="hidden text-sm text-muted-foreground sm:inline-block"
        aria-label="Current workspace"
      >
        {currentTenant.name}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[14rem] justify-between gap-2"
          aria-label="Switch workspace"
        >
          <span className="truncate">
            {currentTenant?.name ?? "Select workspace"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => {
          const isActive = membership.tenant_id === currentTenant?.id
          return (
            <DropdownMenuItem
              key={membership.id}
              onSelect={() => setCurrentTenant(membership.tenant_id)}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {membership.tenant.name}
                </span>
                <span className="truncate text-xs capitalize text-muted-foreground">
                  {membership.role}
                </span>
              </div>
              <Check
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "opacity-100" : "opacity-0"
                )}
                aria-hidden
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
