"use client"

import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

interface DashboardSectionEmptyProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Optional CTA — e.g. "Projekt anlegen" wenn Tenant noch leer ist. */
  action?: React.ReactNode
}

/**
 * PROJ-64 — role-aware empty state used inside dashboard panels.
 *
 * AC-9: empty states are actionable when possible and never imply
 * green/safe.
 */
export function DashboardSectionEmpty({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: DashboardSectionEmptyProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon className="h-9 w-9 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
