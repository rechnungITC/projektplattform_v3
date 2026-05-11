"use client"

import { ArrowUpRight, GitBranch } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { useWorkItemLinks } from "@/hooks/use-work-item-links"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"

interface DeliveredByBannerProps {
  projectId: string
  workItemId: string
}

/**
 * PROJ-27 Designer § 9 — primary-tinted banner above the WP drawer's
 * "Verantwortlich"-Sektion, rendered when an outgoing `delivers`
 * link exists. Only the first match is surfaced as a banner — the
 * full list lives in the Verknüpfungen-Tab.
 */
export function DeliveredByBanner({
  projectId,
  workItemId,
}: DeliveredByBannerProps) {
  const { outgoing } = useWorkItemLinks(projectId, workItemId)

  const delivers = React.useMemo(
    () => outgoing.find((l) => l.link_type === "delivers"),
    [outgoing],
  )
  if (!delivers) return null

  const projectName =
    delivers.target_project?.project_name ??
    delivers.target_item?.project_name ??
    "Sub-Projekt"
  const targetProjectId =
    delivers.target_project?.project_id ?? delivers.target_item?.project_id
  const accessible =
    delivers.target_project?.accessible ??
    delivers.target_item?.accessible ??
    false

  const method =
    (delivers.target_item?.kind as unknown as string | null) ?? null

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5"
      aria-label="Wird geliefert von"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-primary/80">
            Wird geliefert von
          </p>
          <p className="truncate text-sm font-medium text-primary">
            {projectName}
            {method && method in PROJECT_METHOD_LABELS ? (
              <Badge
                variant="outline"
                className="ml-2 border-primary/30 bg-background/60 text-primary"
              >
                {PROJECT_METHOD_LABELS[method as keyof typeof PROJECT_METHOD_LABELS]}
              </Badge>
            ) : null}
          </p>
        </div>
      </div>
      {accessible && targetProjectId ? (
        <Link
          href={`/projects/${targetProjectId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Öffnen
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : (
        <span className="text-xs text-on-surface-variant">
          Kein Zugriff auf Ziel-Projekt
        </span>
      )}
    </section>
  )
}
