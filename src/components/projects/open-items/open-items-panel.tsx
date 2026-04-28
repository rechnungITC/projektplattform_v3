"use client"

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ListTodo,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  type ConvertToDecisionInput,
  convertOpenItemToDecision,
  convertOpenItemToTask,
  createOpenItem,
  deleteOpenItem,
  listOpenItems,
  updateOpenItem,
} from "@/lib/open-items/api"
import {
  OPEN_ITEM_STATUS_LABELS,
  type OpenItem,
} from "@/types/open-item"

import { ConvertToDecisionDialog } from "./convert-to-decision-dialog"
import { OpenItemForm } from "./open-item-form"

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: OpenItem }

interface OpenItemsPanelProps {
  projectId: string
  /** Called when an open item was converted to a decision so the parent
   *  decisions list can refresh. */
  onDecisionCreated: () => void
}

function statusIcon(status: OpenItem["status"]): React.ReactNode {
  if (status === "converted")
    return <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
  if (status === "closed")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
  return <Circle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
}

export function OpenItemsPanel({
  projectId,
  onDecisionCreated,
}: OpenItemsPanelProps) {
  const [items, setItems] = React.useState<OpenItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)
  const [convertTarget, setConvertTarget] = React.useState<OpenItem | null>(
    null
  )

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listOpenItems(projectId)
      setItems(list)
    } catch (err) {
      toast.error("Offene Punkte konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const onCreate = async (input: Parameters<typeof createOpenItem>[1]) => {
    setSubmitting(true)
    try {
      await createOpenItem(projectId, input)
      toast.success("Offener Punkt angelegt")
      setDrawer({ mode: "closed" })
      await reload()
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onUpdate = async (
    itemId: string,
    input: Parameters<typeof updateOpenItem>[2]
  ) => {
    setSubmitting(true)
    try {
      await updateOpenItem(projectId, itemId, input)
      toast.success("Aktualisiert")
      setDrawer({ mode: "closed" })
      await reload()
    } catch (err) {
      toast.error("Aktualisieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (item: OpenItem) => {
    if (!window.confirm(`Punkt „${item.title}" löschen?`)) return
    try {
      await deleteOpenItem(projectId, item.id)
      toast.success("Gelöscht")
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onConvertToTask = async (item: OpenItem) => {
    if (!window.confirm(`„${item.title}" in eine Aufgabe umwandeln?`)) return
    try {
      await convertOpenItemToTask(projectId, item.id)
      toast.success("In Aufgabe umgewandelt", {
        description: "Im Backlog sichtbar.",
      })
      await reload()
    } catch (err) {
      toast.error("Umwandeln fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onConvertToDecision = async (input: ConvertToDecisionInput) => {
    if (!convertTarget) return
    setSubmitting(true)
    try {
      await convertOpenItemToDecision(projectId, convertTarget.id, input)
      toast.success("In Entscheidung umgewandelt")
      setConvertTarget(null)
      await reload()
      onDecisionCreated()
    } catch (err) {
      toast.error("Umwandeln fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const activeItems = items.filter((i) => i.status !== "converted")
  const convertedItems = items.filter((i) => i.status === "converted")

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Offene Punkte</CardTitle>
            <p className="text-xs text-muted-foreground">
              Klärungs­bedarfe — werden in Aufgaben oder Entscheidungen
              umgewandelt.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDrawer({ mode: "create" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Punkt
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Lade …</p>
          ) : activeItems.length === 0 && convertedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Noch keine offenen Punkte.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activeItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border bg-background px-2.5 py-2 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{statusIcon(item.status)}</span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDrawer({ mode: "edit", item })}
                    >
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {OPEN_ITEM_STATUS_LABELS[item.status]}
                        {item.contact ? ` · ${item.contact}` : ""}
                      </p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                        >
                          Umwandeln
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void onConvertToTask(item)}
                        >
                          <ListTodo
                            className="mr-2 h-4 w-4"
                            aria-hidden
                          />
                          → Aufgabe
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setConvertTarget(item)}
                        >
                          <MessageCircle
                            className="mr-2 h-4 w-4"
                            aria-hidden
                          />
                          → Entscheidung
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void onDelete(item)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}

              {convertedItems.length > 0 ? (
                <li className="pt-2">
                  <p className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Umgewandelt
                  </p>
                  <ul className="space-y-1.5">
                    {convertedItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                      >
                        {statusIcon(item.status)}
                        <span className="truncate">{item.title}</span>
                        <Badge
                          variant="outline"
                          className="ml-auto text-[10px]"
                        >
                          {item.converted_to_entity_type === "decisions"
                            ? "→ Entscheidung"
                            : "→ Aufgabe"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "edit"
                ? `${drawer.item.title} bearbeiten`
                : "Neuer offener Punkt"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "edit"
                ? "Inhaltliche Klärung — wird später in eine Aufgabe oder Entscheidung umgewandelt."
                : "Ein offener Klärungsbedarf."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drawer.mode === "edit" ? (
              <OpenItemForm
                initial={drawer.item}
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={(input) => onUpdate(drawer.item.id, input)}
                submitting={submitting}
              />
            ) : drawer.mode === "create" ? (
              <OpenItemForm
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={onCreate}
                submitting={submitting}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConvertToDecisionDialog
        openItem={convertTarget}
        submitting={submitting}
        onConfirm={onConvertToDecision}
        onCancel={() => setConvertTarget(null)}
      />
    </>
  )
}
