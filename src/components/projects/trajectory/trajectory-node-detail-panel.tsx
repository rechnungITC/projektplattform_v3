"use client"

/**
 * PROJ-65 ε.3e (F-62b) — TrajectoryNodeDetailPanel.
 *
 * Right Sheet opened from a focused phase/sprint node in the trajectory
 * graph. Shows the risks linked to that node and lets the user link /
 * unlink existing project risks. Mirrors the GoalDetailPanel Sheet
 * structure (sm:max-w-md, sectioned content).
 *
 * The node id arrives prefixed (`phase:<uuid>` / `sprint:<uuid>`); the
 * raw uuid is used as `linkedId` and the prefix maps to the link kind.
 */

import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Link2,
  Loader2,
  Map as MapIcon,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import {
  createRiskLink,
  deleteRiskLink,
  listRiskLinks,
  type RiskLink,
} from "@/lib/risk-links/api"
import { listRisks } from "@/lib/risks/api"
import type { Risk } from "@/types/risk"

export interface TrajectoryDetailNode {
  /** Prefixed id, e.g. `phase:<uuid>` or `sprint:<uuid>`. */
  id: string
  kind: "phase" | "sprint"
  label: string
}

interface TrajectoryNodeDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  node: TrajectoryDetailNode | null
  planMutateEnabled: boolean
  /** Called after a link/unlink so the per-phase risk roll-up refreshes. */
  onChanged?: () => void
}

function rawId(node: TrajectoryDetailNode): string {
  const prefix = `${node.kind}:`
  return node.id.startsWith(prefix) ? node.id.slice(prefix.length) : node.id
}

export function TrajectoryNodeDetailPanel({
  open,
  onOpenChange,
  projectId,
  node,
  planMutateEnabled,
  onChanged,
}: TrajectoryNodeDetailPanelProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [links, setLinks] = React.useState<RiskLink[]>([])
  const [risks, setRisks] = React.useState<Risk[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const linkedId = node ? rawId(node) : null
  const linkedKind = node?.kind ?? null

  const reload = React.useCallback(async () => {
    if (!node || !linkedId || !linkedKind) return
    try {
      setLoading(true)
      setError(null)
      const [linkList, riskList] = await Promise.all([
        listRiskLinks(projectId, { linkedKind, linkedId }),
        listRisks(projectId),
      ])
      setLinks(linkList)
      setRisks(riskList)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, node, linkedId, linkedKind])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch when the panel opens for a node
    if (open && node) void reload()
  }, [open, node, reload])

  const risksById = React.useMemo(
    () => new Map(risks.map((r) => [r.id, r])),
    [risks],
  )
  const linkedRiskIds = React.useMemo(
    () => new Set(links.map((l) => l.risk_id)),
    [links],
  )
  const availableRisks = React.useMemo(
    () => risks.filter((r) => !linkedRiskIds.has(r.id)),
    [risks, linkedRiskIds],
  )

  async function onAddRisk(riskId: string) {
    if (!linkedId || !linkedKind) return
    setPickerOpen(false)
    setAdding(true)
    try {
      await createRiskLink(projectId, {
        risk_id: riskId,
        linked_kind: linkedKind,
        linked_id: linkedId,
      })
      toast.success("Risiko verknüpft")
      await reload()
      onChanged?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
      if (/already_linked|409/i.test(msg)) {
        toast.info("Diese Verknüpfung besteht bereits")
        await reload()
      } else {
        toast.error("Verknüpfen fehlgeschlagen", { description: msg })
      }
    } finally {
      setAdding(false)
    }
  }

  async function onRemove(link: RiskLink) {
    setRemovingId(link.id)
    try {
      await deleteRiskLink(projectId, link.id)
      toast.success("Verknüpfung entfernt")
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
      onChanged?.()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="trajectory-node-detail-panel"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {node?.kind === "sprint" ? (
              <Zap className="h-4 w-4 text-amber-500" aria-hidden />
            ) : (
              <MapIcon className="h-4 w-4 text-sky-500" aria-hidden />
            )}
            <span className="truncate">{node?.label ?? "Knoten"}</span>
          </SheetTitle>
          <SheetDescription>
            {node?.kind === "sprint" ? "Sprint" : "Phase"} · Risiken &amp;
            Details
          </SheetDescription>
        </SheetHeader>

        {!planMutateEnabled && (
          <Alert className="mt-4">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            <AlertDescription>
              Plan-Mutate ist für dieses Projekt deaktiviert.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Verknüpfte Risiken
                </Label>
                {!loading && !error && (
                  <Badge variant="outline" className="text-[11px]">
                    {links.length}
                  </Badge>
                )}
              </div>

              {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Lade Risiken …
                </div>
              ) : error ? (
                <div className="space-y-2 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void reload()}
                  >
                    Erneut versuchen
                  </Button>
                </div>
              ) : links.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Noch keine Risiken verknüpft.
                </p>
              ) : (
                <ul className="space-y-2" data-testid="node-linked-risks">
                  {links.map((link) => {
                    const risk = risksById.get(link.risk_id)
                    return (
                      <li
                        key={link.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ShieldAlert
                            className="h-3.5 w-3.5 shrink-0 text-red-500"
                            aria-hidden
                          />
                          <span className="truncate text-sm">
                            {risk?.title ?? "(unbekanntes Risiko)"}
                          </span>
                          {risk && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              Score {risk.score}
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label="Verknüpfung entfernen"
                          disabled={removingId === link.id}
                          onClick={() => void onRemove(link)}
                        >
                          {removingId === link.id ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <X className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!loading && !error && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      disabled={adding || availableRisks.length === 0}
                      className="w-full justify-between font-normal"
                      data-testid="node-risk-link-add-trigger"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {adding ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Link2 className="h-4 w-4" aria-hidden />
                        )}
                        {availableRisks.length === 0
                          ? "Keine weiteren Risiken"
                          : "Risiko verknüpfen …"}
                      </span>
                      <ChevronsUpDown
                        className="ml-2 h-4 w-4 shrink-0 opacity-50"
                        aria-hidden
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Risiko suchen …" />
                      <CommandList>
                        <CommandEmpty>Keine Treffer.</CommandEmpty>
                        <CommandGroup heading="Projekt-Risiken">
                          {availableRisks.map((r) => (
                            <CommandItem
                              key={r.id}
                              value={`${r.title} ${r.id}`}
                              onSelect={() => void onAddRisk(r.id)}
                            >
                              <ShieldAlert
                                className="mr-2 h-3.5 w-3.5 text-red-500"
                                aria-hidden
                              />
                              <span className="truncate">{r.title}</span>
                              <Badge
                                variant="outline"
                                className="ml-2 shrink-0 text-[10px]"
                              >
                                {r.score}
                              </Badge>
                              <Check
                                className={cn("ml-2 h-4 w-4 opacity-0")}
                                aria-hidden
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              <p className="text-[11px] text-muted-foreground">
                Verknüpfungen treiben die phasenweise Risiko-Aufrollung im
                Plan-Mutate-Diff.
              </p>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
