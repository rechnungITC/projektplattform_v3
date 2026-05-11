"use client"

import { AlertCircle, Link2, Loader2, Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkItemLinks } from "@/hooks/use-work-item-links"
import { useProjectRole } from "@/hooks/use-project-role"
import type {
  WorkItem,
  WorkItemWithProfile,
} from "@/types/work-item"

import { CreateWorkItemLinkDialog } from "./create-work-item-link-dialog"
import { WorkItemLinkRow } from "./work-item-link-row"

interface WorkItemLinksTabProps {
  projectId: string
  item: WorkItemWithProfile | WorkItem
  canEdit: boolean
  onCountChange?: (count: number) => void
}

/**
 * PROJ-27 Designer § 3 + § 5 — three-section list view inside the
 * work-item drawer's Verknüpfungen tab.
 */
export function WorkItemLinksTab({
  projectId,
  item,
  canEdit,
  onCountChange,
}: WorkItemLinksTabProps) {
  const {
    outgoing,
    incoming,
    pendingApproval,
    loading,
    error,
    remove,
    approve,
    reject,
    refresh,
  } = useWorkItemLinks(projectId, item.id)
  const { role } = useProjectRole(projectId)
  const isLead = role === "lead"

  const totalCount = React.useMemo(
    () =>
      new Set(
        [...outgoing, ...incoming, ...pendingApproval].map((link) => link.id),
      ).size,
    [outgoing, incoming, pendingApproval],
  )

  React.useEffect(() => {
    onCountChange?.(totalCount)
  }, [totalCount, onCountChange])

  const [createOpen, setCreateOpen] = React.useState(false)

  const handleDelete = React.useCallback(
    async (linkId: string) => {
      try {
        await remove(linkId)
        toast.success("Verknüpfung gelöscht")
      } catch (err) {
        toast.error("Verknüpfung konnte nicht gelöscht werden", {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [remove],
  )

  const handleApprove = React.useCallback(
    async (linkId: string) => {
      try {
        await approve(linkId)
        toast.success("Verknüpfung bestätigt")
      } catch (err) {
        toast.error("Bestätigung fehlgeschlagen", {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [approve],
  )

  const handleReject = React.useCallback(
    async (linkId: string) => {
      try {
        await reject(linkId)
        toast.success("Verknüpfung abgelehnt")
      } catch (err) {
        toast.error("Ablehnung fehlgeschlagen", {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [reject],
  )

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Verknüpfungen werden geladen">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verknüpfungen werden geladen …
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Verknüpfungen konnten nicht geladen werden</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
          >
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-on-surface-variant">
          Verknüpfungen halten Beziehungen zu anderen Items fest — auch
          projektübergreifend. Cross-Project-Links außerhalb der Hierarchie
          warten auf Bestätigung des Ziel-Project-Leads.
        </p>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Verknüpfung
          </Button>
        ) : null}
      </div>

      {totalCount === 0 ? (
        <EmptyState canEdit={canEdit} onAdd={() => setCreateOpen(true)} />
      ) : (
        <>
          <LinkSection
            title="Ausgehend"
            description="Dieses Item zeigt auf andere Items."
            links={outgoing}
            perspective="from"
            projectId={projectId}
            canDelete={canEdit}
            canApprove={false}
            onDelete={handleDelete}
          />
          <LinkSection
            title="Eingehend"
            description="Andere Items zeigen auf dieses Item."
            links={incoming}
            perspective="to"
            projectId={projectId}
            canDelete={canEdit}
            canApprove={false}
            onDelete={handleDelete}
          />
          {pendingApproval.length > 0 ? (
            <LinkSection
              title="Warten auf Bestätigung"
              description="Cross-Project-Anfragen — du bist Ziel-Lead und kannst sie bestätigen oder ablehnen."
              links={pendingApproval}
              perspective="to"
              projectId={projectId}
              canDelete={canEdit}
              canApprove={isLead}
              onDelete={handleDelete}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ) : null}
        </>
      )}

      <CreateWorkItemLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        fromWorkItem={item}
        onCreated={refresh}
      />
    </div>
  )
}

function LinkSection({
  title,
  description,
  links,
  perspective,
  projectId,
  canDelete,
  canApprove,
  onDelete,
  onApprove,
  onReject,
}: {
  title: string
  description: string
  links: ReturnType<typeof useWorkItemLinks>["outgoing"]
  perspective: "from" | "to"
  projectId: string
  canDelete: boolean
  canApprove: boolean
  onDelete: (id: string) => void
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (links.length === 0) return null

  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          {title}
          <span className="ml-1.5 rounded bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant">
            {links.length}
          </span>
        </h3>
        <span className="text-xs text-on-surface-variant">{description}</span>
      </header>
      <ul className="space-y-2">
        {links.map((link) => (
          <WorkItemLinkRow
            key={link.id}
            link={link}
            perspective={perspective}
            currentProjectId={projectId}
            canDelete={canDelete}
            canApprove={canApprove}
            onDelete={onDelete}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </ul>
    </section>
  )
}

function EmptyState({
  canEdit,
  onAdd,
}: {
  canEdit: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-outline-variant bg-surface-container-low/40 px-6 py-10 text-center">
      <Link2 className="h-8 w-8 text-on-surface-variant" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">Noch keine Verknüpfungen</p>
        <p className="text-xs text-on-surface-variant">
          Verknüpfe dieses Item mit einem anderen Item oder einem ganzen
          Sub-Projekt, um Abhängigkeiten transparent zu machen.
        </p>
      </div>
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Erste Verknüpfung hinzufügen
        </Button>
      ) : null}
    </div>
  )
}
