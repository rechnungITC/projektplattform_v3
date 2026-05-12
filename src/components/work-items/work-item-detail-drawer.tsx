"use client"

import {
  ChevronRight,
  GitBranch,
  GripVertical,
  Loader2,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react"
import * as React from "react"

import { WorkItemComplianceSection } from "@/components/compliance/work-item-compliance-section"
import { SprintStateBadge } from "@/components/sprints/sprint-state-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useProjectRole } from "@/hooks/use-project-role"
import { useSprints } from "@/hooks/use-sprints"
import { useWorkItem } from "@/hooks/use-work-item"
import { useWorkItemLinks } from "@/hooks/use-work-item-links"
import { cn } from "@/lib/utils"
import { WORK_ITEM_KIND_LABELS } from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

import { ChangeKindDialog } from "./change-kind-dialog"
import { CreateSubprojectFromWpDialog } from "./create-subproject-from-wp-dialog"
import { DeliveredByBanner } from "./delivered-by-banner"
import { WorkItemAllocations } from "./work-item-allocations"
import { WorkItemCostSection } from "./work-item-cost-section"
import { WorkItemLinksTab } from "./work-item-links-tab"
import { ChangeParentDialog } from "./change-parent-dialog"
import { ChangeSprintDialog } from "./change-sprint-dialog"
import { ChangeStatusDialog } from "./change-status-dialog"
import { DeleteWorkItemDialog } from "./delete-work-item-dialog"
import { EditWorkItemDialog } from "./edit-work-item-dialog"
import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

const DRAWER_WIDTH_STORAGE_KEY = "work-item-detail-drawer.width"
const DRAWER_DEFAULT_WIDTH = 640
const DRAWER_MIN_WIDTH = 420
const DRAWER_MAX_WIDTH = 960
const DRAWER_VIEWPORT_MARGIN = 56
const DRAWER_RESIZE_STEP = 32

interface WorkItemDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workItemId: string | null
  method: ProjectMethod | null
  onChanged: () => void | Promise<void>
}

export function WorkItemDetailDrawer({
  open,
  onOpenChange,
  projectId,
  workItemId,
  method,
  onChanged,
}: WorkItemDetailDrawerProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const [drawerWidth, setDrawerWidth] = React.useState(DRAWER_DEFAULT_WIDTH)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const saved = window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY)
      const parsed = saved ? Number(saved) : Number.NaN
      if (!Number.isFinite(parsed)) return
      setDrawerWidth(clampDrawerWidth(parsed, window.innerWidth))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const {
    item,
    parentChain,
    loading,
    notFound,
    refresh,
  } = useWorkItem(projectId, open ? workItemId : null)

  const { sprints } = useSprints(projectId)
  const sprint = item?.sprint_id
    ? sprints.find((s) => s.id === item.sprint_id) ?? null
    : null

  const [editOpen, setEditOpen] = React.useState(false)
  const [parentOpen, setParentOpen] = React.useState(false)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [sprintOpen, setSprintOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [kindOpen, setKindOpen] = React.useState(false)
  const [subProjectOpen, setSubProjectOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<"details" | "links">("details")

  const { outgoing, incoming, pendingApproval } = useWorkItemLinks(
    projectId,
    open ? workItemId : null,
  )
  const { role: projectRole } = useProjectRole(projectId)
  const linkCount = React.useMemo(
    () =>
      new Set(
        [...outgoing, ...incoming, ...pendingApproval].map((link) => link.id),
      ).size,
    [outgoing, incoming, pendingApproval],
  )
  const actionablePendingCount =
    projectRole === "lead" ? pendingApproval.length : 0

  const handleChanged = React.useCallback(async () => {
    await refresh()
    await onChanged()
  }, [refresh, onChanged])

  const commitDrawerWidth = React.useCallback((width: number) => {
    const viewportWidth =
      typeof window === "undefined" ? DRAWER_DEFAULT_WIDTH : window.innerWidth
    const clamped = clampDrawerWidth(width, viewportWidth)
    setDrawerWidth(clamped)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(clamped))
    }
  }, [])

  const nudgeDrawerWidth = React.useCallback((delta: number) => {
    setDrawerWidth((current) => {
      const viewportWidth =
        typeof window === "undefined" ? DRAWER_DEFAULT_WIDTH : window.innerWidth
      const clamped = clampDrawerWidth(current + delta, viewportWidth)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(clamped))
      }
      return clamped
    })
  }, [])

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return
      if (typeof window === "undefined" || window.innerWidth < 640) return

      event.preventDefault()

      const root = document.documentElement
      const previousCursor = root.style.cursor
      const previousUserSelect = document.body.style.userSelect
      root.style.cursor = "ew-resize"
      document.body.style.userSelect = "none"

      const resizeFromPointer = (clientX: number) => {
        commitDrawerWidth(window.innerWidth - clientX)
      }
      resizeFromPointer(event.clientX)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault()
        resizeFromPointer(moveEvent.clientX)
      }

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", cleanup)
        window.removeEventListener("pointercancel", cleanup)
        root.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", cleanup)
      window.addEventListener("pointercancel", cleanup)
    },
    [commitDrawerWidth],
  )

  const handleResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        nudgeDrawerWidth(DRAWER_RESIZE_STEP)
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        nudgeDrawerWidth(-DRAWER_RESIZE_STEP)
      }
      if (event.key === "Home") {
        event.preventDefault()
        commitDrawerWidth(DRAWER_MIN_WIDTH)
      }
      if (event.key === "End") {
        event.preventDefault()
        commitDrawerWidth(DRAWER_MAX_WIDTH)
      }
    },
    [commitDrawerWidth, nudgeDrawerWidth],
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setActiveTab("details")
        onOpenChange(nextOpen)
      }}
    >
      <SheetContent
        className="w-full overflow-y-auto sm:min-w-[420px]"
        style={
          {
            "--work-item-drawer-width": `${drawerWidth}px`,
            width: "min(var(--work-item-drawer-width), 100vw)",
            maxWidth: "min(960px, calc(100vw - 1rem))",
          } as React.CSSProperties
        }
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={DRAWER_MIN_WIDTH}
          aria-valuemax={DRAWER_MAX_WIDTH}
          aria-valuenow={drawerWidth}
          aria-label="Drawer-Breite anpassen"
          tabIndex={0}
          title="Breite anpassen"
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
          className="group absolute inset-y-0 left-0 z-20 hidden w-3 cursor-ew-resize touch-none items-center justify-center outline-none sm:flex"
        >
          <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-border text-muted-foreground opacity-70 transition group-hover:bg-primary/40 group-hover:text-primary group-hover:opacity-100 group-focus-visible:bg-primary/40 group-focus-visible:text-primary group-focus-visible:opacity-100">
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
        </div>
        {loading ? (
          <DrawerSkeleton />
        ) : notFound || !item ? (
          <SheetHeader>
            <SheetTitle>Nicht gefunden</SheetTitle>
            <SheetDescription>
              Dieses Work Item existiert nicht oder ist nicht sichtbar.
            </SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <WorkItemKindBadge kind={item.kind} />
                <WorkItemStatusBadge status={item.status} />
                <WorkItemPriorityBadge priority={item.priority} />
                {sprint ? (
                  <Badge variant="outline" className="inline-flex gap-1">
                    {sprint.name}
                    <SprintStateBadge state={sprint.state} className="text-xs" />
                  </Badge>
                ) : null}
              </div>
              <SheetTitle className="break-words text-xl">
                {item.title}
              </SheetTitle>
              {parentChain.length > 0 ? (
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {parentChain.map((p, idx) => (
                      <React.Fragment key={p.id}>
                        <span className="inline-flex items-center gap-1">
                          <WorkItemKindBadge kind={p.kind} iconOnly />
                          <span className="truncate">{p.title}</span>
                        </span>
                        {idx < parentChain.length - 1 ? (
                          <ChevronRight
                            className="h-3 w-3"
                            aria-hidden
                          />
                        ) : null}
                      </React.Fragment>
                    ))}
                  </div>
                </SheetDescription>
              ) : null}
            </SheetHeader>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "details" | "links")}
              className="mt-6"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="links" className="gap-1.5">
                  <span>Verknüpfungen</span>
                  {linkCount > 0 ? (
                    <Badge
                      variant={
                        actionablePendingCount > 0 ? "default" : "secondary"
                      }
                      className={cn(
                        "h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]",
                        actionablePendingCount > 0 &&
                          "bg-tertiary text-background",
                      )}
                      aria-label={
                        actionablePendingCount > 0
                          ? `${linkCount} Verknüpfungen — ${actionablePendingCount} warten auf Bestätigung`
                          : `${linkCount} Verknüpfungen`
                      }
                    >
                      {linkCount}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4 space-y-4">
                <DeliveredByBanner projectId={projectId} workItemId={item.id} />

              {/* Responsible */}
              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Verantwortlich
                </h3>
                {item.responsible_user_id ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">
                        {(item.responsible_display_name ??
                          item.responsible_email ??
                          "?")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {item.responsible_display_name ??
                          item.responsible_email ??
                          "—"}
                      </p>
                      {item.responsible_email ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {item.responsible_email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Niemand zugewiesen
                  </p>
                )}
              </section>

              {/* Description */}
              {item.description ? (
                <section className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Beschreibung
                  </h3>
                  <p className="whitespace-pre-wrap text-sm">
                    {item.description}
                  </p>
                </section>
              ) : null}

              {/* Attributes */}
              {Object.keys(item.attributes).length > 0 ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                    >
                      <span>Attribute (JSON)</span>
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(item.attributes, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}

              {/* Resource allocation (PROJ-11) */}
              <WorkItemAllocations
                projectId={projectId}
                workItemId={item.id}
                canEdit={canEdit}
              />

              {/* Plan-Kosten (PROJ-24) */}
              <WorkItemCostSection
                projectId={projectId}
                workItemId={item.id}
                canEdit={canEdit}
              />

              {/* Compliance (PROJ-18) */}
              <WorkItemComplianceSection
                projectId={projectId}
                workItemId={item.id}
                canEdit={canEdit}
                onTagsChanged={handleChanged}
              />

              {/* AI source */}
              {item.created_from_proposal_id ? (
                <section className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900 dark:bg-violet-950/40">
                  <div className="flex items-start gap-2">
                    <Sparkles
                      className="mt-0.5 h-4 w-4 text-violet-600 dark:text-violet-300"
                      aria-hidden
                    />
                    <div>
                      <p className="font-medium">KI-Vorschlag</p>
                      <p className="text-xs text-muted-foreground">
                        Quelle:{" "}
                        <code className="break-all">
                          ai_proposals#{item.created_from_proposal_id.slice(0, 8)}
                        </code>
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Actions */}
              {canEdit ? (
                <section className="space-y-2 border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Aktionen
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {item.kind === "work_package" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setSubProjectOpen(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <GitBranch className="mr-1 h-4 w-4" aria-hidden />
                        Sub-Projekt anlegen
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditOpen(true)}
                    >
                      Bearbeiten
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusOpen(true)}
                    >
                      Status
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setParentOpen(true)}
                    >
                      Übergeordnet
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSprintOpen(true)}
                    >
                      Sprint
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setKindOpen(true)}
                    >
                      <Settings2 className="mr-1 h-4 w-4" aria-hidden />
                      Typ
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                      Löschen
                    </Button>
                  </div>
                </section>
              ) : null}

              <div className="border-t pt-3 text-xs text-muted-foreground">
                Typ: {WORK_ITEM_KIND_LABELS[item.kind]} · zuletzt geändert{" "}
                {formatDateTime(item.updated_at)}
              </div>
              </TabsContent>

              <TabsContent value="links" className="mt-4">
                <WorkItemLinksTab
                  projectId={projectId}
                  item={item}
                  canEdit={canEdit}
                />
              </TabsContent>
            </Tabs>

            <EditWorkItemDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              projectId={projectId}
              item={item}
              onSaved={handleChanged}
            />
            <ChangeStatusDialog
              open={statusOpen}
              onOpenChange={setStatusOpen}
              projectId={projectId}
              item={item}
              onChanged={handleChanged}
            />
            <ChangeParentDialog
              open={parentOpen}
              onOpenChange={setParentOpen}
              projectId={projectId}
              item={item}
              onChanged={handleChanged}
            />
            <ChangeSprintDialog
              open={sprintOpen}
              onOpenChange={setSprintOpen}
              projectId={projectId}
              item={item}
              onChanged={handleChanged}
            />
            <ChangeKindDialog
              open={kindOpen}
              onOpenChange={setKindOpen}
              projectId={projectId}
              item={item}
              method={method}
              onChanged={handleChanged}
            />
            <DeleteWorkItemDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              projectId={projectId}
              item={item}
              onDeleted={async () => {
                await handleChanged()
                onOpenChange(false)
              }}
            />
            {item.kind === "work_package" ? (
              <CreateSubprojectFromWpDialog
                open={subProjectOpen}
                onOpenChange={setSubProjectOpen}
                parentProjectId={projectId}
                workItem={item}
                onCreated={async () => {
                  await handleChanged()
                }}
              />
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function clampDrawerWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return DRAWER_DEFAULT_WIDTH
  const maxWidth =
    viewportWidth < 640
      ? viewportWidth
      : Math.min(DRAWER_MAX_WIDTH, viewportWidth - DRAWER_VIEWPORT_MARGIN)
  const safeMax = Math.max(320, maxWidth)
  const safeMin = Math.min(DRAWER_MIN_WIDTH, safeMax)
  return Math.min(Math.max(width, safeMin), safeMax)
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Lädt Work Item">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-20" />
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span className="text-sm text-muted-foreground">Lädt …</span>
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
