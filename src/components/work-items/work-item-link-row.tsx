"use client"

import {
  Check,
  Clock,
  ExternalLink as ExternalLinkIcon,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CrossProjectLinkBadge } from "@/components/work-items/cross-project-link-badge"
import { WorkItemKindBadge } from "@/components/work-items/work-item-kind-badge"
import { WorkItemStatusBadge } from "@/components/work-items/work-item-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { linkTypeLabel } from "@/lib/work-items/link-types"
import type { WorkItemLinkWithTargets } from "@/types/work-item-link"

interface WorkItemLinkRowProps {
  link: WorkItemLinkWithTargets
  /** "outgoing" = current item is from-side; "incoming" = current item is to-side. */
  perspective: "from" | "to"
  /** Project the user is currently in (drives same-project badge omission). */
  currentProjectId: string
  /** When true, the row exposes a delete action. */
  canDelete: boolean
  /** When true, the row exposes approve/reject (pending only). */
  canApprove: boolean
  onDelete?: (linkId: string) => void | Promise<void>
  onApprove?: (linkId: string) => void | Promise<void>
  onReject?: (linkId: string) => void | Promise<void>
}

/**
 * PROJ-27 Designer § 5 — single row in the Verknüpfungen-Tab list.
 *
 * Row anatomy: relation-label · target item (kind icon + title) ·
 * cross-project-badge · approval-state · overflow menu.
 *
 * Whole-project `delivers`-links render the project-name in place of
 * the target item title.
 */
export function WorkItemLinkRow({
  link,
  perspective,
  currentProjectId,
  canDelete,
  canApprove,
  onDelete,
  onApprove,
  onReject,
}: WorkItemLinkRowProps) {
  const partner =
    perspective === "from" ? link.target_item : link.source_item
  const partnerProject = link.target_project
  const isWholeProjectLink = !partner && partnerProject != null

  const projectId = partner?.project_id ?? partnerProject?.project_id ?? null
  const projectName =
    partner?.project_name ?? partnerProject?.project_name ?? null
  const accessible =
    partner?.accessible ?? partnerProject?.accessible ?? false

  const lagLabel =
    link.lag_days != null && link.lag_days !== 0
      ? ` (${link.lag_days > 0 ? "+" : ""}${link.lag_days} Tage)`
      : ""

  return (
    <li className="group flex flex-wrap items-center gap-3 rounded-md border border-outline-variant bg-surface-container-low px-3 py-2.5 transition-colors hover:bg-surface-container">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          {linkTypeLabel(link.link_type, perspective)}
          {lagLabel}
        </span>

        {isWholeProjectLink ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
            {accessible && projectId ? (
              <Link
                href={`/projects/${projectId}`}
                className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                <span className="truncate">
                  {projectName ?? "Projekt"} (Gesamtes Projekt)
                </span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 truncate text-on-surface-variant">
                <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                Nicht zugängliches Projekt
              </span>
            )}
          </span>
        ) : partner && partner.accessible ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
            {partner.kind ? <WorkItemKindBadge kind={partner.kind} iconOnly /> : null}
            <span className="truncate font-medium">
              {partner.title ?? "(Unbenannt)"}
            </span>
            {partner.status ? (
              <WorkItemStatusBadge status={partner.status} />
            ) : null}
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm italic text-on-surface-variant">
            Verknüpft mit Item in nicht zugänglichem Projekt
          </span>
        )}

        {projectId ? (
          <CrossProjectLinkBadge
            targetProjectId={projectId}
            targetProjectName={projectName}
            accessible={accessible}
            currentProjectId={currentProjectId}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {link.approval_state === "pending" ? (
          <Badge
            variant="outline"
            className="gap-1 border-primary/40 bg-primary/10 text-primary"
          >
            <Clock className="h-3 w-3" aria-hidden />
            Warten auf Bestätigung
          </Badge>
        ) : link.approval_state === "rejected" ? (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" aria-hidden /> Abgelehnt
          </Badge>
        ) : null}

        {canApprove && link.approval_state === "pending" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7"
              onClick={() => onApprove?.(link.id)}
            >
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Bestätigen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => onReject?.(link.id)}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Ablehnen
            </Button>
          </>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Verknüpfung-Aktionen"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {partner && partner.accessible ? (
              <DropdownMenuItem asChild>
                <Link href={`/projects/${partner.project_id}/backlog?wi=${partner.id}`}>
                  Öffnen
                </Link>
              </DropdownMenuItem>
            ) : isWholeProjectLink && projectId && accessible ? (
              <DropdownMenuItem asChild>
                <Link href={`/projects/${projectId}`}>Projekt öffnen</Link>
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete?.(link.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Verknüpfung
                  löschen
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
