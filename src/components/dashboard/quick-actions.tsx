"use client"

import {
  CheckSquare,
  FilePlus2,
  FolderPlus,
  ListChecks,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface QuickActionsProps {
  capabilities: {
    can_create_project: boolean
    can_create_work_item: boolean
    can_open_approvals: boolean
    can_open_reports: boolean
  }
}

/**
 * PROJ-64 AC-6 — Quick actions row.
 *
 * - Respects per-action capabilities surfaced by the dashboard
 *   summary endpoint (module gates + role checks).
 * - Disabled actions explain why (tooltip).
 * - "Open approvals" is always available because every authenticated
 *   user can land on the approvals page (filtered by their own
 *   stakeholder linkage).
 *
 * The "create work item" entry deep-links into the projects list
 * because work-item creation always happens inside a project room
 * — surfacing a global "new work item" without picking a project
 * first would be misleading.
 */
export function QuickActions({ capabilities }: QuickActionsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Schnellaktionen"
      >
        <ActionLink
          href="/projects/new"
          enabled={capabilities.can_create_project}
          disabledReason="Du benötigst die Tenant-Admin-Rolle, um neue Projekte anzulegen."
          icon={<FolderPlus className="mr-2 h-4 w-4" aria-hidden />}
          label="Neues Projekt"
          variant="default"
        />
        <ActionLink
          href="/projects"
          enabled={capabilities.can_create_work_item}
          disabledReason="Wechsle in ein Projekt, in dem du Editor- oder Lead-Rechte hast, um Work Items zu erstellen."
          icon={<ListChecks className="mr-2 h-4 w-4" aria-hidden />}
          label="Work Item"
        />
        <ActionLink
          href="/approvals"
          enabled={capabilities.can_open_approvals}
          icon={<CheckSquare className="mr-2 h-4 w-4" aria-hidden />}
          label="Genehmigungen"
        />
        <ActionLink
          href="/reports"
          enabled={capabilities.can_open_reports}
          disabledReason="Das Reports-Modul ist für deinen Tenant nicht aktiviert."
          icon={<FilePlus2 className="mr-2 h-4 w-4" aria-hidden />}
          label="Reports"
        />
      </div>
    </TooltipProvider>
  )
}

interface ActionLinkProps {
  href: string
  enabled: boolean
  disabledReason?: string
  icon: React.ReactNode
  label: string
  variant?: "default" | "outline" | "secondary"
}

function ActionLink({
  href,
  enabled,
  disabledReason,
  icon,
  label,
  variant = "outline",
}: ActionLinkProps) {
  if (!enabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              size="sm"
              variant={variant}
              disabled
              aria-disabled
            >
              {icon}
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        {disabledReason && (
          <TooltipContent className="max-w-xs">{disabledReason}</TooltipContent>
        )}
      </Tooltip>
    )
  }
  return (
    <Button asChild size="sm" variant={variant}>
      <Link href={href}>
        {icon}
        {label}
      </Link>
    </Button>
  )
}
