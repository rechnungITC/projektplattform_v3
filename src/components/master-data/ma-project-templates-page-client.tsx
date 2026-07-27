"use client"

import { LayoutTemplate, RotateCcw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DEAL_SIDE_LABELS,
  type DealSide,
  listMaProjectTemplates,
  type MaProjectTemplate,
} from "@/lib/ma-project/templates-api"

/**
 * PROJ-96 — read-only tenant catalog of M&A project templates.
 *
 * GET lazily seeds the Buy-Side default on first access (AC1). Templates are
 * applied to a project at creation time (wizard) or via the project's
 * apply-template surface — copy-on-create. A deep template editor
 * (create/reorder/field-edit) is intentionally out of MVP scope (PROJ-Y-96d).
 */
export function MaProjectTemplatesPageClient() {
  const [templates, setTemplates] = React.useState<MaProjectTemplate[]>([])
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      // GET lazily seeds the Buy-Side default on first access.
      setTemplates(await listMaProjectTemplates())
    } catch (err) {
      toast.error("Projekt-Vorlagen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Projekt-Vorlagen (M&amp;A)
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tenant-weiter Katalog wiederverwendbarer M&amp;A-Projektstrukturen.
            Bei der Projektanlage kann eine Vorlage gewählt werden; Phasen,
            Workstreams und Deliverables werden dann ins neue Projekt kopiert
            (Copy-on-create) und sind danach projektindividuell anpassbar.
            Spätere Vorlagen-Änderungen wirken nicht rückwirkend.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()} disabled={loading}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Aktualisieren
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Noch keine Vorlagen vorhanden.
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <article key={t.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutTemplate
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <h2 className="font-medium">{t.name}</h2>
                  <Badge variant="secondary">
                    {DEAL_SIDE_LABELS[t.deal_side as DealSide] ?? t.deal_side}
                  </Badge>
                  <Badge variant="outline">v{t.version}</Badge>
                  {!t.is_active && <Badge variant="outline">inaktiv</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.workstreams.length} Workstreams · {t.deliverables.length}{" "}
                  Deliverables
                </span>
              </div>

              {t.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.description}
                </p>
              )}

              {t.workstreams.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {t.workstreams.map((ws) => {
                    const dels = t.deliverables.filter(
                      (d) => d.workstream_key === ws.workstream_key
                    )
                    return (
                      <li
                        key={ws.id}
                        className="rounded border bg-muted/10 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{ws.label}</span>
                        {dels.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                            {dels.map((d) => (
                              <li key={d.id}>{d.name}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
