"use client"

import {
  AlertTriangle,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import {
  useBudgetCategories,
  useBudgetItems,
  useBudgetSummary,
} from "@/hooks/use-budget"
import { useProjectAccess } from "@/hooks/use-project-access"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"
import type { BudgetCategory, BudgetItemWithTotals } from "@/types/budget"

import { BudgetCategoryDialog } from "./budget-category-dialog"
import { BudgetItemDialog } from "./budget-item-dialog"
import { BudgetPostingDialog } from "./budget-posting-dialog"
import { BudgetPostingsDrawer } from "./budget-postings-drawer"
import {
  TRAFFIC_LIGHT_CLASSES,
  TRAFFIC_LIGHT_LABELS,
  formatCurrency,
} from "./format"

interface ProjectBudgetTabClientProps {
  projectId: string
}

export function ProjectBudgetTabClient({
  projectId,
}: ProjectBudgetTabClientProps) {
  const { tenantSettings } = useAuth()
  const moduleActive = isModuleActive(tenantSettings, "budget")
  const canEdit = useProjectAccess(projectId, "edit_master")

  const tenantDefaultCurrency =
    (tenantSettings?.budget_settings?.default_currency as SupportedCurrency | undefined) ??
    "EUR"

  const [displayCurrency, setDisplayCurrency] =
    React.useState<SupportedCurrency>(tenantDefaultCurrency)

  const {
    categories,
    loading: catsLoading,
    create: createCategory,
    update: updateCategory,
    remove: removeCategory,
  } = useBudgetCategories(projectId)
  const {
    items,
    loading: itemsLoading,
    create: createItem,
    update: updateItem,
    softDelete: softDeleteItem,
    refresh: refreshItems,
  } = useBudgetItems(projectId)
  const {
    summary,
    loading: summaryLoading,
    refresh: refreshSummary,
  } = useBudgetSummary(projectId, displayCurrency)

  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false)
  const [editingCategory, setEditingCategory] = React.useState<BudgetCategory | undefined>(undefined)
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<BudgetItemWithTotals | undefined>(undefined)
  const [postingDialogItem, setPostingDialogItem] =
    React.useState<BudgetItemWithTotals | null>(null)
  const [drawerItem, setDrawerItem] = React.useState<BudgetItemWithTotals | null>(null)
  const [defaultCategoryId, setDefaultCategoryId] = React.useState<string>("")

  const itemsByCategory = React.useMemo(() => {
    const map = new Map<string, BudgetItemWithTotals[]>()
    for (const it of items) {
      const list = map.get(it.category_id) ?? []
      list.push(it)
      map.set(it.category_id, list)
    }
    return map
  }, [items])

  async function handleAfterChange() {
    await refreshItems()
    await refreshSummary()
  }

  async function handleCategorySubmit(input: { name: string; description?: string | null; position?: number }) {
    if (editingCategory) {
      await updateCategory(editingCategory.id, input)
    } else {
      await createCategory(input)
    }
  }

  async function handleItemSubmit(input: import("@/lib/budget/api").BudgetItemInput) {
    if (editingItem) {
      await updateItem(editingItem.id, input)
    } else {
      await createItem(input)
    }
    await handleAfterChange()
  }

  async function handleSoftDelete(itemId: string) {
    if (!confirm("Posten deaktivieren? Buchungen bleiben sichtbar.")) return
    try {
      await softDeleteItem(itemId)
      await handleAfterChange()
      toast.success("Posten deaktiviert.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Deaktivieren.")
    }
  }

  async function handleCategoryDelete(category: BudgetCategory) {
    if (!confirm(`Kategorie „${category.name}" löschen? Funktioniert nur, wenn keine aktiven Posten enthalten sind.`)) return
    try {
      await removeCategory(category.id)
      await handleAfterChange()
      toast.success("Kategorie gelöscht.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Löschen.")
    }
  }

  if (!moduleActive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>
            Das Budget-Modul ist für diesen Tenant deaktiviert. Tenant-Admin
            kann es in den Einstellungen aktivieren.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const totalsAvailable = summary && summary.totals.converted_planned > 0
  const overallRatio = totalsAvailable
    ? Math.min(100, Math.round((summary!.totals.converted_actual / summary!.totals.converted_planned) * 100))
    : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="h-5 w-5" aria-hidden />
            Budget
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan- und Ist-Werte pro Posten. Buchungen sind unveränderbar —
            Storno via negative Gegenbuchung.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={displayCurrency}
            onValueChange={(v) => setDisplayCurrency(v as SupportedCurrency)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  Anzeigen in {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingCategory(undefined)
                setCategoryDialogOpen(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Kategorie anlegen
            </Button>
          ) : null}
        </div>
      </div>

      {/* Overall Banner */}
      {totalsAvailable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gesamtsumme (in {displayCurrency})</CardTitle>
            <CardDescription>
              Plan: {formatCurrency(summary!.totals.converted_planned, displayCurrency)}
              {" · "}
              Ist:{" "}
              {formatCurrency(summary!.totals.converted_actual, displayCurrency)}
              {" "}
              ({overallRatio}%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={overallRatio} aria-label={`Gesamt-Verbrauch: ${overallRatio}%`} />
          </CardContent>
        </Card>
      ) : null}

      {/* Missing FX rates banner */}
      {summary && summary.missing_rates.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 text-warning"
              aria-hidden
            />
            <div className="space-y-1 text-warning">
              <p className="font-medium">FX-Raten fehlen</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {summary.missing_rates.map((m) => (
                  <li key={`${m.from_currency}-${m.to_currency}`}>
                    {m.from_currency} → {m.to_currency} ({m.item_count} Posten)
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Tenant-Admin pflegt Raten unter <em>Einstellungen → FX-Raten</em>.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Categories list */}
      {catsLoading || itemsLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Noch keine Budget-Kategorien.{" "}
            {canEdit
              ? `Klicke „Kategorie anlegen“ oben.`
              : `Editor / Lead kann welche anlegen.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = (itemsByCategory.get(cat.id) ?? []).filter((i) => i.is_active)
            return (
              <Card key={cat.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{cat.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDefaultCategoryId(cat.id)
                              setEditingItem(undefined)
                              setItemDialogOpen(true)
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" aria-hidden />
                            Posten
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Kategorie-Aktionen"
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  setEditingCategory(cat)
                                  setCategoryDialogOpen(true)
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" aria-hidden />
                                Bearbeiten
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  void handleCategoryDelete(cat)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                                Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {cat.description ? (
                    <CardDescription>{cat.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-2">
                  {catItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Keine aktiven Posten in dieser Kategorie.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {catItems.map((item) => {
                        const ratio =
                          item.planned_amount > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  (item.actual_amount / item.planned_amount) * 100
                                )
                              )
                            : 0
                        return (
                          <li
                            key={item.id}
                            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  {item.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={TRAFFIC_LIGHT_CLASSES[item.traffic_light_state]}
                                >
                                  {TRAFFIC_LIGHT_LABELS[item.traffic_light_state]}
                                </Badge>
                                {item.multi_currency_postings_count > 0 ? (
                                  <Badge variant="outline" className="text-xs">
                                    Multi-Currency ({item.multi_currency_postings_count})
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Plan{" "}
                                {formatCurrency(
                                  item.planned_amount,
                                  item.planned_currency as SupportedCurrency
                                )}{" "}
                                · Ist{" "}
                                {formatCurrency(
                                  item.actual_amount,
                                  item.planned_currency as SupportedCurrency
                                )}{" "}
                                ({ratio}%)
                                {item.reservation_amount > 0 ? (
                                  <>
                                    {" · Res "}
                                    {formatCurrency(
                                      item.reservation_amount,
                                      item.planned_currency as SupportedCurrency
                                    )}
                                  </>
                                ) : null}
                              </p>
                              <Progress
                                value={ratio}
                                aria-label={`Verbrauch ${item.name}: ${ratio}%`}
                                className="mt-2 max-w-xs"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {canEdit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPostingDialogItem(item)}
                                >
                                  <Receipt className="mr-1 h-3 w-3" aria-hidden />
                                  Buchen
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setDrawerItem(item)}
                                aria-label="Buchungs-Historie öffnen"
                              >
                                <History className="h-4 w-4" aria-hidden />
                              </Button>
                              {canEdit ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Posten-Aktionen"
                                    >
                                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault()
                                        setEditingItem(item)
                                        setDefaultCategoryId(item.category_id)
                                        setItemDialogOpen(true)
                                      }}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" aria-hidden />
                                      Bearbeiten
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault()
                                        void handleSoftDelete(item.id)
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                                      Deaktivieren
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <BudgetCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        initial={editingCategory}
        onSubmit={handleCategorySubmit}
      />
      <BudgetItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        categories={categories}
        initial={editingItem}
        defaultCategoryId={defaultCategoryId || categories[0]?.id}
        defaultCurrency={tenantDefaultCurrency}
        onSubmit={handleItemSubmit}
      />
      {postingDialogItem ? (
        <BudgetPostingDialog
          open={postingDialogItem !== null}
          onOpenChange={(open) => {
            if (!open) setPostingDialogItem(null)
          }}
          item={postingDialogItem}
          onSubmit={async (input) => {
            const { createBudgetPosting } = await import("@/lib/budget/api")
            await createBudgetPosting(projectId, input)
            await handleAfterChange()
          }}
        />
      ) : null}
      <BudgetPostingsDrawer
        open={drawerItem !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerItem(null)
        }}
        projectId={projectId}
        item={drawerItem}
        canEdit={canEdit}
        onChange={handleAfterChange}
      />

      {summaryLoading ? null : null}
    </div>
  )
}
