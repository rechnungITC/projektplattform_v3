"use client"

/**
 * PROJ-65 ε.3e (F-62a) — RiskLinksTab.
 *
 * Risk-side linking surface inside the Risk edit drawer. Lists the
 * phases/sprints currently linked to a risk and lets the user add or
 * remove links. These links drive the per-phase risk roll-up in the
 * trajectory plan-mutate diff.
 */

import {
  Check,
  ChevronsUpDown,
  Link2,
  Loader2,
  Map as MapIcon,
  X,
  Zap,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  createRiskLink,
  deleteRiskLink,
  listRiskLinks,
  type RiskLink,
  type RiskLinkKind,
} from "@/lib/risk-links/api"

interface TargetOption {
  id: string
  name: string
}

interface RiskLinksTabProps {
  projectId: string
  riskId: string
}

interface PhaseRow {
  id: string
  name: string
}
interface SprintRow {
  id: string
  name: string
}

async function fetchTargets(
  projectId: string,
): Promise<{ phases: TargetOption[]; sprints: TargetOption[] }> {
  const [phasesRes, sprintsRes] = await Promise.all([
    fetch(`/api/projects/${encodeURIComponent(projectId)}/phases`, {
      cache: "no-store",
    }),
    fetch(`/api/projects/${encodeURIComponent(projectId)}/sprints`, {
      cache: "no-store",
    }),
  ])
  const phases: TargetOption[] = phasesRes.ok
    ? ((await phasesRes.json()) as { phases: PhaseRow[] }).phases.map((p) => ({
        id: p.id,
        name: p.name,
      }))
    : []
  const sprints: TargetOption[] = sprintsRes.ok
    ? ((await sprintsRes.json()) as { sprints: SprintRow[] }).sprints.map(
        (s) => ({ id: s.id, name: s.name }),
      )
    : []
  return { phases, sprints }
}

export function RiskLinksTab({ projectId, riskId }: RiskLinksTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [links, setLinks] = React.useState<RiskLink[]>([])
  const [phases, setPhases] = React.useState<TargetOption[]>([])
  const [sprints, setSprints] = React.useState<TargetOption[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const [reloadTick, setReloadTick] = React.useState(0)
  const reload = React.useCallback(() => setReloadTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    Promise.all([
      listRiskLinks(projectId, { riskId }),
      fetchTargets(projectId),
    ])
      .then(([linkList, targets]) => {
        if (cancelled) return
        setLinks(linkList)
        setPhases(targets.phases)
        setSprints(targets.sprints)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, riskId, reloadTick])

  const linkedKeys = React.useMemo(
    () => new Set(links.map((l) => `${l.linked_kind}:${l.linked_id}`)),
    [links],
  )

  const availablePhases = React.useMemo(
    () => phases.filter((p) => !linkedKeys.has(`phase:${p.id}`)),
    [phases, linkedKeys],
  )
  const availableSprints = React.useMemo(
    () => sprints.filter((s) => !linkedKeys.has(`sprint:${s.id}`)),
    [sprints, linkedKeys],
  )

  function targetName(kind: RiskLinkKind, id: string): string {
    const pool = kind === "phase" ? phases : sprints
    return pool.find((t) => t.id === id)?.name ?? "(gelöscht)"
  }

  async function onAdd(kind: RiskLinkKind, id: string) {
    setPickerOpen(false)
    setAdding(true)
    try {
      await createRiskLink(projectId, {
        risk_id: riskId,
        linked_kind: kind,
        linked_id: id,
      })
      toast.success(
        kind === "phase" ? "Phase verknüpft" : "Sprint verknüpft",
      )
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
      if (/already_linked|409/i.test(msg)) {
        toast.info("Diese Verknüpfung besteht bereits")
        reload()
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
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Lade Verknüpfungen …
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm text-destructive">
          Verknüpfungen konnten nicht geladen werden: {error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  const hasAvailable = availablePhases.length > 0 || availableSprints.length > 0

  return (
    <div className="space-y-4" data-testid="risk-links-tab">
      <p className="text-sm text-muted-foreground">
        Verknüpfe dieses Risiko mit Phasen oder Sprints. Verknüpfungen treiben
        die phasenweise Risiko-Aufrollung im Trajektorien-Plan-Mutate-Diff.
      </p>

      {links.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
          Noch keine Verknüpfungen
        </div>
      ) : (
        <ul className="space-y-2" data-testid="risk-links-list">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 text-[11px]"
                >
                  {link.linked_kind === "phase" ? (
                    <MapIcon className="h-3 w-3" aria-hidden />
                  ) : (
                    <Zap className="h-3 w-3" aria-hidden />
                  )}
                  {link.linked_kind === "phase" ? "Phase" : "Sprint"}
                </Badge>
                <span className="truncate text-sm">
                  {targetName(link.linked_kind, link.linked_id)}
                </span>
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <X className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={pickerOpen}
            disabled={adding || !hasAvailable}
            className="w-full justify-between font-normal"
            data-testid="risk-link-add-trigger"
          >
            <span className="flex items-center gap-2 truncate">
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden />
              )}
              {hasAvailable
                ? "Phase oder Sprint verknüpfen …"
                : "Alle Ziele bereits verknüpft"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Suche Phase oder Sprint …" />
            <CommandList>
              <CommandEmpty>Keine Treffer.</CommandEmpty>
              {availablePhases.length > 0 && (
                <CommandGroup heading="Phasen">
                  {availablePhases.map((opt) => (
                    <CommandItem
                      key={`phase:${opt.id}`}
                      value={`phase ${opt.name}`}
                      onSelect={() => void onAdd("phase", opt.id)}
                    >
                      <MapIcon
                        className="mr-2 h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="truncate">{opt.name}</span>
                      <Check className={cn("ml-auto h-4 w-4 opacity-0")} aria-hidden />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {availableSprints.length > 0 && (
                <CommandGroup heading="Sprints">
                  {availableSprints.map((opt) => (
                    <CommandItem
                      key={`sprint:${opt.id}`}
                      value={`sprint ${opt.name}`}
                      onSelect={() => void onAdd("sprint", opt.id)}
                    >
                      <Zap
                        className="mr-2 h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="truncate">{opt.name}</span>
                      <Check className={cn("ml-auto h-4 w-4 opacity-0")} aria-hidden />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
