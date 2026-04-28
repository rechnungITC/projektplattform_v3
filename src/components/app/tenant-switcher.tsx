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

interface TenantSwitcherProps {
  /**
   * PROJ-3: when "standalone", hide the tenant switcher unconditionally
   * (defense-in-depth: stand-alone deployments only ever have one tenant,
   * but if they somehow gain a second, the switcher must still stay out
   * of the UI per the operational contract).
   */
  operationMode?: "shared" | "standalone"
}

export function TenantSwitcher({
  operationMode = "shared",
}: TenantSwitcherProps) {
  const { memberships, currentTenant, setCurrentTenant } = useAuth()

  // Hide the switcher in stand-alone mode, or if the user belongs to fewer
  // than 2 tenants. Both conditions collapse to the same single-tenant UX.
  if (operationMode === "standalone" || memberships.length < 2) {
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
