"use client"

import { LayoutGrid, List, Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/audit/history-tab"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import {
  clearDismissedSuggestions,
  copyStakeholder,
  createStakeholder,
  deactivateStakeholder,
  dismissSuggestion,
  listStakeholderSuggestions,
  listStakeholders,
  reactivateStakeholder,
  updateStakeholder,
  type StakeholderInput,
} from "@/lib/stakeholders/api"
import {
  STAKEHOLDER_SCORE_LABELS,
  type Stakeholder,
  type StakeholderScore,
  type StakeholderSuggestion,
} from "@/types/stakeholder"

import { StakeholderForm } from "./stakeholder-form"
import { StakeholderMatrix } from "./stakeholder-matrix"
import { StakeholderSuggestions } from "./stakeholder-suggestions"
import { StakeholderTable } from "./stakeholder-table"

type View = "list" | "matrix"
type DrawerState =
  | { mode: "closed" }
  | { mode: "create"; prefillRoleKey?: string | null }
  | { mode: "edit"; stakeholder: Stakeholder }

interface StakeholderTabClientProps {
  projectId: string
}

export function StakeholderTabClient({ projectId }: StakeholderTabClientProps) {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  const [stakeholders, setStakeholders] = React.useState<Stakeholder[]>([])
  const [suggestions, setSuggestions] = React.useState<StakeholderSuggestion[]>(
    []
  )
  const [dismissedCount, setDismissedCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(true)
  const [view, setView] = React.useState<View>("list")
  const [includeInactive, setIncludeInactive] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [bucketFilter, setBucketFilter] = React.useState<{
    influence: StakeholderScore
    impact: StakeholderScore
  } | null>(null)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)

  const reloadStakeholders = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listStakeholders(projectId, { includeInactive })
      setStakeholders(list)
    } catch (err) {
      toast.error("Stakeholder konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, includeInactive])

  const reloadSuggestions = React.useCallback(async () => {
    try {
      setSuggestionsLoading(true)
      const result = await listStakeholderSuggestions(projectId)
      setSuggestions(result.suggestions)
      setDismissedCount(result.dismissed_count)
    } catch {
      // Suggestions failures are non-blocking; silently ignore.
    } finally {
      setSuggestionsLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void reloadStakeholders()
  }, [reloadStakeholders])

  React.useEffect(() => {
    void reloadSuggestions()
  }, [reloadSuggestions])

  const filtered = React.useMemo(() => {
    let result = stakeholders
    if (bucketFilter) {
      result = result.filter(
        (s) =>
          s.influence === bucketFilter.influence &&
          s.impact === bucketFilter.impact
      )
    }
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.role_key ?? "").toLowerCase().includes(q) ||
          (s.org_unit ?? "").toLowerCase().includes(q)
      )
    }
    return result
  }, [stakeholders, search, bucketFilter])

  const onCreate = async (input: StakeholderInput) => {
    setSubmitting(true)
    try {
      const created = await createStakeholder(projectId, input)
      setStakeholders((prev) => [...prev, created])
      toast.success("Stakeholder hinzugefügt")
      setDrawer({ mode: "closed" })
      void reloadSuggestions()
    } catch (err) {
      toast.error("Konnte nicht angelegt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onUpdate = async (sid: string, input: StakeholderInput) => {
    setSubmitting(true)
    try {
      const updated = await updateStakeholder(projectId, sid, input)
      setStakeholders((prev) =>
        prev.map((s) => (s.id === sid ? updated : s))
      )
      toast.success("Stakeholder aktualisiert")
      setDrawer({ mode: "closed" })
      void reloadSuggestions()
    } catch (err) {
      toast.error("Konnte nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onCopy = async (s: Stakeholder) => {
    try {
      const created = await copyStakeholder(projectId, s.id)
      toast.success("Kopie angelegt", { description: created.name })
      setDrawer({ mode: "edit", stakeholder: created })
      void reloadStakeholders()
      void reloadSuggestions()
    } catch (err) {
      toast.error("Kopie fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onToggleActive = async (s: Stakeholder) => {
    try {
      if (s.is_active) {
        await deactivateStakeholder(projectId, s.id)
        toast.success("Stakeholder deaktiviert")
      } else {
        await reactivateStakeholder(projectId, s.id)
        toast.success("Stakeholder reaktiviert")
      }
      setDrawer({ mode: "closed" })
      void reloadStakeholders()
      void reloadSuggestions()
    } catch (err) {
      toast.error("Status konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onSuggestionAdd = (sug: StakeholderSuggestion) => {
    setDrawer({ mode: "create", prefillRoleKey: sug.role_key })
  }

  const onSuggestionDismiss = async (sug: StakeholderSuggestion) => {
    try {
      await dismissSuggestion(projectId, sug.role_key)
      // Server is source of truth for dismissed_count — refetch to keep the
      // recover-link visible across reloads (PROJ-8 QA M1 fix).
      void reloadSuggestions()
    } catch (err) {
      toast.error("Vorschlag konnte nicht verworfen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onClearDismissals = async () => {
    try {
      await clearDismissedSuggestions(projectId)
      void reloadSuggestions()
      toast.success("Verworfene Vorschläge zurückgeholt")
    } catch (err) {
      toast.error("Konnte nicht zurückgeholt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  // Matrix cell-click smart action: 1 match → edit, 0 → create, n>1 →
  // switch to list with a structured bucket filter (not a search-string hack).
  const onMatrixCell = (
    influence: StakeholderScore,
    impact: StakeholderScore
  ) => {
    const matches = stakeholders.filter(
      (s) => s.influence === influence && s.impact === impact && s.is_active
    )
    if (matches.length === 1) {
      setDrawer({ mode: "edit", stakeholder: matches[0] })
    } else if (matches.length === 0) {
      setDrawer({ mode: "create" })
    } else {
      setBucketFilter({ influence, impact })
      setSearch("")
      setView("list")
    }
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-muted-foreground">
        Kein aktiver Mandant ausgewählt.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stakeholder</h1>
          <p className="text-sm text-muted-foreground">
            Personen und Organisationen rund um das Projekt.
          </p>
        </div>
        <Button onClick={() => setDrawer({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> Stakeholder
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={view}
              onValueChange={(v) => setView(v as View)}
            >
              <TabsList>
                <TabsTrigger value="list">
                  <List className="mr-2 h-4 w-4" aria-hidden /> Liste
                </TabsTrigger>
                <TabsTrigger value="matrix">
                  <LayoutGrid className="mr-2 h-4 w-4" aria-hidden /> Matrix
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Suche…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              Inaktive einblenden
            </label>
          </div>

          {bucketFilter ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span>
                Quadrant:{" "}
                <strong>
                  Einfluss {STAKEHOLDER_SCORE_LABELS[bucketFilter.influence]}
                </strong>
                {" · "}
                <strong>
                  Impact {STAKEHOLDER_SCORE_LABELS[bucketFilter.impact]}
                </strong>{" "}
                ({filtered.length})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBucketFilter(null)}
              >
                Filter entfernen
              </Button>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Lade Stakeholder …</p>
          ) : view === "list" ? (
            <StakeholderTable
              stakeholders={filtered}
              onRowClick={(s) => setDrawer({ mode: "edit", stakeholder: s })}
            />
          ) : (
            <StakeholderMatrix
              stakeholders={filtered.filter((s) => s.is_active)}
              onCellClick={onMatrixCell}
              onMarkerClick={(s) =>
                setDrawer({ mode: "edit", stakeholder: s })
              }
            />
          )}
        </div>

        <aside>
          <StakeholderSuggestions
            suggestions={suggestions}
            loading={suggestionsLoading}
            hasDismissals={dismissedCount > 0}
            onAdd={onSuggestionAdd}
            onDismiss={(s) => void onSuggestionDismiss(s)}
            onClearDismissals={() => void onClearDismissals()}
          />
        </aside>
      </div>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "edit"
                ? `${drawer.stakeholder.name} bearbeiten`
                : "Neuer Stakeholder"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "edit"
                ? "Änderungen werden direkt gespeichert."
                : "Eine Person oder Organisation rund um das Projekt erfassen."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drawer.mode === "edit" ? (
              <Tabs defaultValue="form">
                <TabsList>
                  <TabsTrigger value="form">Stammdaten</TabsTrigger>
                  <TabsTrigger value="history">Historie</TabsTrigger>
                </TabsList>
                <TabsContent value="form" className="mt-4">
                  <StakeholderForm
                    tenantId={tenantId}
                    initial={drawer.stakeholder}
                    onCancel={() => setDrawer({ mode: "closed" })}
                    onSubmit={(input) => onUpdate(drawer.stakeholder.id, input)}
                    submitting={submitting}
                    secondaryAction={
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void onCopy(drawer.stakeholder)}
                        >
                          Kopieren
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void onToggleActive(drawer.stakeholder)
                          }
                        >
                          {drawer.stakeholder.is_active
                            ? "Deaktivieren"
                            : "Reaktivieren"}
                        </Button>
                      </div>
                    }
                  />
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                  <HistoryTab
                    entityType="stakeholders"
                    entityId={drawer.stakeholder.id}
                    onMutated={() => void reloadStakeholders()}
                  />
                </TabsContent>
              </Tabs>
            ) : drawer.mode === "create" ? (
              <StakeholderForm
                tenantId={tenantId}
                prefillRoleKey={drawer.prefillRoleKey ?? null}
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={onCreate}
                submitting={submitting}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
