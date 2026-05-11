"use client"

import { Info, Loader2, Search, ShieldCheck } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useWorkItemLinks } from "@/hooks/use-work-item-links"
import { useWorkItemSearch } from "@/hooks/use-work-item-search"
import { createClient } from "@/lib/supabase/client"
import {
  LINK_TYPE_META,
  WORK_ITEM_LINK_GROUP_LABELS,
  getLinkTypeOptions,
  resolveLinkHierarchy,
  type LinkHierarchyKind,
  type WorkItemLinkGroup,
  type WorkItemLinkType,
} from "@/lib/work-items/link-types"
import { WORK_ITEM_KIND_LABELS } from "@/types/work-item"
import type { WorkItem, WorkItemWithProfile } from "@/types/work-item"
import type { WorkItemSearchResultItem } from "@/types/work-item-link"

interface CreateWorkItemLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  fromWorkItem: WorkItem | WorkItemWithProfile
  onCreated?: () => void | Promise<void>
}

const GROUP_ORDER: WorkItemLinkGroup[] = [
  "delivery",
  "sequence",
  "blocker",
  "hierarchy",
  "duplicate",
  "generic",
]

interface ProjectRefRow {
  id: string
  parent_project_id: string | null
}

/**
 * PROJ-27 Designer § 5 "+ entry point" — three-field dialog:
 *  1. Relation Select (grouped + perspectivisch labelled)
 *  2. Ziel-Item Combobox (tenant-scoped search, async)
 *  3. Lag-Input (only for precedes/follows)
 *
 * Plus a hierarchy-awareness banner that flips between the
 * primary-tinted ("sofort wirksam") and tertiary-info ("wartet auf
 * Bestätigung") tone based on the resolved hierarchy of the
 * selected target.
 */
export function CreateWorkItemLinkDialog({
  open,
  onOpenChange,
  projectId,
  fromWorkItem,
  onCreated,
}: CreateWorkItemLinkDialogProps) {
  const [linkType, setLinkType] = React.useState<WorkItemLinkType>("relates")
  const [target, setTarget] = React.useState<WorkItemSearchResultItem | null>(
    null,
  )
  const [lagDays, setLagDays] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)
  const [comboOpen, setComboOpen] = React.useState(false)
  const { create } = useWorkItemLinks(projectId, fromWorkItem.id)

  const options = React.useMemo(() => getLinkTypeOptions(), [])
  const groupedOptions = React.useMemo(() => {
    const groups: Record<WorkItemLinkGroup, typeof options> = {
      delivery: [],
      sequence: [],
      blocker: [],
      hierarchy: [],
      duplicate: [],
      generic: [],
    }
    for (const o of options) groups[o.group].push(o)
    return groups
  }, [options])

  const meta = LINK_TYPE_META[linkType]

  const search = useWorkItemSearch({
    tenantScope: true,
    excludeWorkItemId: fromWorkItem.id,
  })

  // ---- Hierarchy lookup --------------------------------------------------
  // Load the candidate projects (current + target) once when a target is
  // picked, so the banner can classify same / hierarchy / cross.
  const [projectsMap, setProjectsMap] = React.useState<
    Map<string, ProjectRefRow>
  >(new Map())

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const ids = new Set<string>([projectId])
        if (target?.project_id) ids.add(target.project_id)
        const { data, error } = await supabase
          .from("projects")
          .select("id, parent_project_id")
          .in("id", Array.from(ids))
        if (cancelled) return
        if (error) return
        const map = new Map<string, ProjectRefRow>()
        for (const row of (data ?? []) as ProjectRefRow[]) {
          map.set(row.id, row)
        }
        setProjectsMap(map)
      } catch {
        // Silent — banner falls back to neutral state.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectId, target?.project_id])

  const hierarchy: LinkHierarchyKind | null = React.useMemo(() => {
    if (!target) return null
    return resolveLinkHierarchy(projectId, target.project_id, projectsMap)
  }, [target, projectId, projectsMap])

  // Reset when re-opened.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLinkType("relates")
      setTarget(null)
      setLagDays("")
      search.setQuery("")
      setSubmitting(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) {
      toast.error("Bitte ein Ziel-Item auswählen")
      return
    }
    setSubmitting(true)
    try {
      const lag = meta.supportsLag && lagDays.trim() !== ""
        ? Number.parseInt(lagDays, 10)
        : null
      if (lag != null && (Number.isNaN(lag) || lag < -2000 || lag > 2000)) {
        toast.error("Lag muss zwischen -2000 und 2000 Tagen liegen")
        setSubmitting(false)
        return
      }
      const res = await create({
        from_work_item_id: fromWorkItem.id,
        to_work_item_id: target.id,
        link_type: linkType,
        lag_days: lag,
      })
      const msg =
        res.approval_state === "pending"
          ? "Verknüpfung angefragt — wartet auf Bestätigung des Ziel-Leads"
          : "Verknüpfung erstellt"
      toast.success(msg)
      await onCreated?.()
      onOpenChange(false)
    } catch (err) {
      toast.error("Verknüpfung konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Verknüpfung hinzufügen</DialogTitle>
          <DialogDescription>
            Verknüpfe dieses Item mit einem anderen — auch projektübergreifend.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="link-type">Beziehung</Label>
            <Select
              value={linkType}
              onValueChange={(v) => setLinkType(v as WorkItemLinkType)}
            >
              <SelectTrigger id="link-type">
                <SelectValue placeholder="Beziehung wählen" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_ORDER.map((g) =>
                  groupedOptions[g].length === 0 ? null : (
                    <SelectGroup key={g}>
                      <SelectLabel>{WORK_ITEM_LINK_GROUP_LABELS[g]}</SelectLabel>
                      {groupedOptions[g].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ziel-Item</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  aria-expanded={comboOpen}
                >
                  <span className="truncate text-left">
                    {target ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-xs uppercase text-on-surface-variant">
                          {WORK_ITEM_KIND_LABELS[target.kind]}
                        </span>
                        <span>{target.title}</span>
                        <span className="text-xs text-on-surface-variant">
                          · {target.project_name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-on-surface-variant">
                        Item suchen …
                      </span>
                    )}
                  </span>
                  <Search className="h-4 w-4 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Mind. 2 Zeichen eingeben …"
                    value={search.query}
                    onValueChange={search.setQuery}
                  />
                  <CommandList>
                    {search.loading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-on-surface-variant">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Suche läuft …
                      </div>
                    ) : search.results.length === 0 && search.query.length >= 2 ? (
                      <CommandEmpty>Keine Treffer.</CommandEmpty>
                    ) : search.query.length < 2 ? (
                      <div className="px-3 py-6 text-sm text-on-surface-variant">
                        Tippe den Titel oder Code des Items.
                      </div>
                    ) : (
                      <CommandGroup heading="Treffer">
                        {search.results.map((r) => (
                          <CommandItem
                            key={r.id}
                            value={r.id}
                            onSelect={() => {
                              setTarget(r)
                              setComboOpen(false)
                            }}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="min-w-0">
                              <span className="text-xs uppercase text-on-surface-variant mr-1.5">
                                {WORK_ITEM_KIND_LABELS[r.kind]}
                              </span>
                              <span className="truncate">{r.title}</span>
                            </span>
                            <span className="text-xs text-on-surface-variant">
                              {r.project_name}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {meta.supportsLag ? (
            <div className="space-y-1.5">
              <Label htmlFor="link-lag">Lag (Tage, optional)</Label>
              <Input
                id="link-lag"
                type="number"
                min={-2000}
                max={2000}
                value={lagDays}
                placeholder="z. B. 3 oder -2"
                onChange={(e) => setLagDays(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant">
                Positive Werte verschieben das Ziel nach hinten, negative nach
                vorne.
              </p>
            </div>
          ) : null}

          {target && hierarchy ? (
            <HierarchyBanner kind={hierarchy} />
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !target}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                  Erstellen …
                </>
              ) : (
                "Verknüpfung erstellen"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function HierarchyBanner({ kind }: { kind: LinkHierarchyKind }) {
  if (kind === "same" || kind === "hierarchy") {
    return (
      <Alert className="border-primary/40 bg-primary/10 text-primary">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <AlertTitle>Sofort wirksam</AlertTitle>
        <AlertDescription className="text-primary/80">
          {kind === "same"
            ? "Verknüpfung innerhalb des Projekts — keine Bestätigung erforderlich."
            : "Verknüpfung innerhalb deiner Projekt-Hierarchie — keine Bestätigung erforderlich."}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert className="border-outline-variant bg-surface-container-low">
      <Info
        className="h-4 w-4 text-on-surface-variant"
        aria-hidden
      />
      <AlertTitle>Wartet auf Bestätigung</AlertTitle>
      <AlertDescription className="text-on-surface-variant">
        Das Ziel-Projekt liegt außerhalb deiner Hierarchie. Die Verknüpfung
        wird erst aktiv, sobald der Lead des Ziel-Projekts sie bestätigt.
      </AlertDescription>
    </Alert>
  )
}
