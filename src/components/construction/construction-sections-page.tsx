"use client"

import { Camera, ChevronRight, Layers, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ConstructionPhotoStrip } from "./construction-photo-strip"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ConstructionSectionDialog } from "@/components/construction/construction-section-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildSectionTree,
  flattenSectionTree,
  useConstructionSections,
} from "@/hooks/use-construction"
import { useConstructionPhotoCounts } from "@/hooks/use-construction-photos"
import { useProjectAccess } from "@/hooks/use-project-access"
import { deleteConstructionSection } from "@/lib/construction/api"
import type { ConstructionPhotoCounts } from "@/types/construction-photo"
import type { ConstructionSection } from "@/types/construction"

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; parent: ConstructionSection | null }
  | { mode: "edit"; section: ConstructionSection }

/**
 * PROJ-45-α — the construction section tree (Bauabschnitte): WHERE work
 * happens. Free depth, because "Bauteil / Geschoss / Wohnung" is the normal
 * case rather than the exception (lock L5).
 *
 * Rendered as an indented list rather than a drag-and-drop tree: moving a node
 * happens through an explicit parent picker, which cannot offer a target that
 * would create a cycle. Drag-and-drop is a comfort feature on top and is
 * deliberately deferred — see the spec's deviation note.
 */
export function ConstructionSectionsPage({ projectId }: { projectId: string }) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { sections, loading, moduleInactive, error, refresh } =
    useConstructionSections(projectId)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })
  const [busyId, setBusyId] = React.useState<string | null>(null)
  // PROJ-45-ε / AC-45ε.15 — EINE Abfrage für die ganze Liste. Je Abschnitt eine
  // Strecke zu laden hiesse N Abrufe für eine Zahl, und die Bilder selbst
  // braucht die Liste gar nicht.
  const {
    counts: photoCounts,
    refresh: refreshPhotoCounts,
  } = useConstructionPhotoCounts(projectId)
  const [openPhotos, setOpenPhotos] = React.useState<string | null>(null)

  const rows = React.useMemo(
    () => flattenSectionTree(buildSectionTree(sections)),
    [sections]
  )

  const childCount = React.useCallback(
    (id: string) => sections.filter((s) => s.parent_id === id).length,
    [sections]
  )

  const onDelete = async (section: ConstructionSection) => {
    const children = childCount(section.id)
    const message =
      children > 0
        ? `Abschnitt „${section.label}" löschen? Die ${children} untergeordneten Abschnitte werden mitgelöscht. Arbeitspakete und Risiken bleiben erhalten und verlieren nur den Bezug.`
        : `Abschnitt „${section.label}" löschen? Arbeitspakete und Risiken bleiben erhalten und verlieren nur den Bezug.`
    if (!window.confirm(message)) return

    setBusyId(section.id)
    try {
      await deleteConstructionSection(projectId, section.id)
      toast.success("Abschnitt gelöscht")
      await refresh()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusyId(null)
    }
  }

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Bauabschnitte gehören zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Layers className="h-5 w-5 text-muted-foreground" />
            Bauabschnitte
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Wo gebaut wird — beliebig tief gliederbar, etwa Bauteil → Geschoss →
            Einheit. Gleiche Namen sind unter verschiedenen Elternknoten erlaubt.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setDialog({ mode: "create", parent: null })}>
            <Plus className="mr-2 h-4 w-4" />
            Abschnitt anlegen
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10">
            <p className="font-medium">Noch keine Bauabschnitte</p>
            <p className="max-w-xl text-sm text-muted-foreground">
              {canEdit
                ? "Beginne mit den obersten Einheiten (etwa „Haus A“, „Haus B“) und gliedere sie anschließend weiter."
                : "Die Projektleitung legt die Gliederung an."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map((node) => (
                <li
                  key={node.id}
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{ paddingLeft: `${node.depth * 20 + 16}px` }}
                >
                  {node.depth > 0 ? (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{node.label}</p>
                    {node.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {node.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-expanded={openPhotos === node.id}
                    onClick={() =>
                      setOpenPhotos((cur) => (cur === node.id ? null : node.id))
                    }
                  >
                    <Camera className="mr-1 h-3.5 w-3.5" />
                    Fotos
                    {photoCount(photoCounts, node.id) > 0 ? (
                      <Badge variant="secondary" className="ml-1.5">
                        {photoCount(photoCounts, node.id)}
                      </Badge>
                    ) : null}
                  </Button>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ mode: "create", parent: node })}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Unterabschnitt
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${node.label} bearbeiten`}
                        onClick={() => setDialog({ mode: "edit", section: node })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${node.label} löschen`}
                        disabled={busyId === node.id}
                        onClick={() => onDelete(node)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {openPhotos ? (
              <div className="border-t p-4">
                <ConstructionPhotoStrip
                  key={openPhotos}
                  projectId={projectId}
                  anchor={{ section_id: openPhotos }}
                  canManage={canEdit}
                  heading={`Fotos · ${
                    rows.find((r) => r.id === openPhotos)?.label ?? "Abschnitt"
                  }`}
                  onChanged={refreshPhotoCounts}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <ConstructionSectionDialog
        projectId={projectId}
        open={dialog.mode !== "closed"}
        section={dialog.mode === "edit" ? dialog.section : null}
        defaultParentId={dialog.mode === "create" ? (dialog.parent?.id ?? null) : null}
        allSections={sections}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={refresh}
      />
    </div>
  )
}

/**
 * Fotozahl eines Abschnitts. `0` bei fehlender Auskunft — und die Fläche zeigt
 * dann KEIN Abzeichen statt einer erfundenen Null: „keine Fotos" und „noch nicht
 * geladen" sehen sonst gleich aus.
 */
function photoCount(
  counts: ConstructionPhotoCounts | null,
  sectionId: string
): number {
  return counts?.by_section?.[sectionId] ?? 0
}
