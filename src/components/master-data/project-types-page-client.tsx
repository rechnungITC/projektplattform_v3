"use client"

import { Cog, FolderTree } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ProjectTypeOverrideForm } from "@/components/master-data/project-type-override-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useProjectTypeOverrides } from "@/hooks/use-project-type-overrides"
import { PROJECT_TYPE_CATALOG } from "@/lib/project-types/catalog"
import type {
  ProjectTypeOverrideFields,
  ProjectTypeOverrideRow,
} from "@/types/master-data"
import type { ProjectType } from "@/types/project"

interface DrawerState {
  typeKey: ProjectType
  current: ProjectTypeOverrideRow | null
}

export function ProjectTypesPageClient() {
  const { overrides, loading, error, save, remove } = useProjectTypeOverrides()
  const [drawer, setDrawer] = React.useState<DrawerState | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Re-sync drawer entry after refresh.
  React.useEffect(() => {
    if (!drawer) return
    const fresh = overrides.get(drawer.typeKey) ?? null
    if (fresh !== drawer.current) {
      setDrawer({ typeKey: drawer.typeKey, current: fresh })
    }
  }, [overrides, drawer])

  async function handleSave(typeKey: ProjectType, payload: ProjectTypeOverrideFields) {
    setSubmitting(true)
    try {
      await save(typeKey, payload)
      toast.success("Override gespeichert")
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetField(typeKey: ProjectType) {
    // Reset = delete the override row entirely. Per-field reset would
    // require a PATCH endpoint; for MVP "reset to default" means "drop
    // all overrides for this type". Since the form re-emits the full
    // payload on save, partial-field reset is achievable by simply not
    // including that field in the next save.
    if (!overrides.has(typeKey)) return
    if (
      !window.confirm(
        "Override wirklich löschen? Der Code-Default greift wieder."
      )
    ) {
      return
    }
    try {
      await remove(typeKey)
      toast.success("Override entfernt — Default greift wieder")
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <>
      <div className="space-y-4">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderTree className="h-6 w-6" aria-hidden />
            Projekttypen
          </h1>
          <p className="text-sm text-muted-foreground">
            Standard-Rollen und Pflicht-Infos pro Projekttyp. Code-Defaults
            werden geerbt; Overrides können additiv pro Feld aktiviert
            werden. Inherited-Felder erben automatisch zukünftige
            Code-Updates.
          </p>
        </header>

        {loading && overrides.size === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Projekttypen …</p>
        ) : error ? (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROJECT_TYPE_CATALOG.map((type) => {
              const override = overrides.get(type.key) ?? null
              return (
                <li key={type.key}>
                  <Card
                    className="h-full cursor-pointer transition-colors hover:border-primary"
                    onClick={() => setDrawer({ typeKey: type.key, current: override })}
                  >
                    <CardContent className="space-y-2 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{type.label_de}</p>
                        <code className="text-xs text-muted-foreground">
                          {type.key}
                        </code>
                        {override ? (
                          <Badge variant="default">Override aktiv</Badge>
                        ) : (
                          <Badge variant="outline">Inherited</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Standard-Rollen:{" "}
                        {(override?.overrides.standard_roles?.length ??
                          type.standard_roles.length)}{" "}
                        ·{" "}
                        Pflicht-Infos:{" "}
                        {(override?.overrides.required_info?.length ??
                          type.required_info.length)}
                      </p>
                      <div className="flex justify-end">
                        <Button type="button" size="sm" variant="ghost">
                          <Cog className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Bearbeiten
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Sheet
        open={drawer !== null}
        onOpenChange={(open) => {
          if (!open) setDrawer(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          {drawer ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {PROJECT_TYPE_CATALOG.find((t) => t.key === drawer.typeKey)
                    ?.label_de ?? drawer.typeKey}
                </SheetTitle>
                <SheetDescription>
                  Override speichert eine vollständige Liste pro Feld. „Reset&ldquo;
                  pro Feld setzt zurück auf den Code-Default. Komplettes
                  Löschen entfernt den Override für diesen Typ.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <ProjectTypeOverrideForm
                  typeKey={drawer.typeKey}
                  initial={drawer.current?.overrides ?? null}
                  submitting={submitting}
                  onSave={(payload) => handleSave(drawer.typeKey, payload)}
                  onResetField={() => Promise.resolve()}
                />

                {drawer.current ? (
                  <div className="border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleResetField(drawer.typeKey)}
                    >
                      Override komplett löschen
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
