"use client"

import { Plus, Trash2, Users } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import {
  type AllocationInput,
  createAllocation,
  deleteAllocation,
  listResources,
  listWorkItemResources,
  updateAllocation,
} from "@/lib/resources/api"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type { Resource, WorkItemResource } from "@/types/resource"

interface WorkItemAllocationsProps {
  projectId: string
  workItemId: string
  canEdit: boolean
}

export function WorkItemAllocations({
  projectId,
  workItemId,
  canEdit,
}: WorkItemAllocationsProps) {
  const { tenantSettings } = useAuth()
  const moduleActive = isModuleActive(tenantSettings, "resources")

  const [allocations, setAllocations] = React.useState<WorkItemResource[]>([])
  const [resources, setResources] = React.useState<Resource[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Inline new-allocation form state
  const [pickedResourceId, setPickedResourceId] = React.useState<string>("")
  const [pickedPct, setPickedPct] = React.useState<string>("100")
  const [submitting, setSubmitting] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!moduleActive) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const [as, rs] = await Promise.all([
        listWorkItemResources(projectId, workItemId),
        listResources({ active_only: true }).catch(() => []),
      ])
      setAllocations(as)
      setResources(rs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, workItemId, moduleActive])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  if (!moduleActive) return null

  const allocatedIds = new Set(allocations.map((a) => a.resource_id))
  const pickable = resources.filter((r) => !allocatedIds.has(r.id))
  const resourceById = new Map(resources.map((r) => [r.id, r]))

  async function add() {
    if (!pickedResourceId) {
      toast.error("Bitte eine Ressource wählen.")
      return
    }
    const pct = Number.parseFloat(pickedPct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 200) {
      toast.error("Allocation-% muss zwischen 0 und 200 liegen.")
      return
    }
    const input: AllocationInput = {
      resource_id: pickedResourceId,
      allocation_pct: pct,
    }
    setSubmitting(true)
    try {
      await createAllocation(projectId, workItemId, input)
      toast.success("Allocation angelegt")
      setPickedResourceId("")
      setPickedPct("100")
      await refresh()
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function changePct(allocation: WorkItemResource, newPct: number) {
    if (!Number.isFinite(newPct) || newPct < 0 || newPct > 200) return
    if (newPct === allocation.allocation_pct) return
    try {
      await updateAllocation(projectId, workItemId, allocation.id, {
        allocation_pct: newPct,
      })
      await refresh()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  async function remove(allocation: WorkItemResource) {
    if (!window.confirm("Allocation entfernen?")) return
    try {
      await deleteAllocation(projectId, workItemId, allocation.id)
      toast.success("Allocation entfernt")
      await refresh()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <section className="space-y-2 border-t pt-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ressourcen-Allocation
        </h3>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Allocations …</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Ressource zugeordnet.
        </p>
      ) : (
        <ul className="space-y-1">
          {allocations.map((a) => {
            const r = resourceById.get(a.resource_id)
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="flex-1 truncate">
                  {r?.display_name ?? "(unbekannt)"}
                </span>
                {canEdit ? (
                  <AllocationPctInput
                    value={a.allocation_pct}
                    onCommit={(pct) => void changePct(a, pct)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {a.allocation_pct}%
                  </span>
                )}
                {canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
          <div className="min-w-[180px] flex-1">
            <Label htmlFor="alloc_pick_resource" className="text-xs">
              Ressource
            </Label>
            <Select
              value={pickedResourceId}
              onValueChange={setPickedResourceId}
            >
              <SelectTrigger id="alloc_pick_resource">
                <SelectValue placeholder="Auswählen …" />
              </SelectTrigger>
              <SelectContent>
                {pickable.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Keine weiteren Ressourcen
                  </SelectItem>
                ) : (
                  pickable.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.display_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24">
            <Label htmlFor="alloc_pct" className="text-xs">
              %
            </Label>
            <Input
              id="alloc_pct"
              type="number"
              min="0"
              max="200"
              step="5"
              value={pickedPct}
              onChange={(e) => setPickedPct(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={submitting || !pickedResourceId}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Hinzufügen
          </Button>
        </div>
      ) : null}
    </section>
  )
}

interface AllocationPctInputProps {
  value: number
  onCommit: (pct: number) => void
}

function AllocationPctInput({ value, onCommit }: AllocationPctInputProps) {
  const [draft, setDraft] = React.useState(String(value))
  React.useEffect(() => {
    setDraft(String(value))
  }, [value])

  return (
    <Input
      type="number"
      min="0"
      max="200"
      step="5"
      className="h-7 w-20 text-right"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number.parseFloat(draft)
        if (Number.isFinite(parsed)) onCommit(parsed)
        else setDraft(String(value))
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
