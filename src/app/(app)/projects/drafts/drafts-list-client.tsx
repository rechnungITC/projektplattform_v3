"use client"

import { FilePlus2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { useAuth } from "@/hooks/use-auth"
import { discardDraft, listDrafts } from "@/lib/wizard/draft-storage"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"
import { PROJECT_TYPE_LABELS } from "@/types/project"
import type { WizardDraft } from "@/types/wizard"

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function DraftsListClient() {
  const router = useRouter()
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  const [drafts, setDrafts] = React.useState<WizardDraft[]>([])
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    if (!tenantId) return
    try {
      setLoading(true)
      const fetched = await listDrafts(tenantId)
      setDrafts(fetched)
    } catch (err) {
      toast.error("Entwürfe konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const onDiscard = React.useCallback(
    async (draftId: string) => {
      const confirmed = window.confirm("Diesen Entwurf endgültig verwerfen?")
      if (!confirmed) return
      try {
        await discardDraft(draftId)
        toast.success("Entwurf verworfen")
        await reload()
      } catch (err) {
        toast.error("Entwurf konnte nicht verworfen werden", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    },
    [reload]
  )

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Kein aktiver Mandant ausgewählt.
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Lade Entwürfe …
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projekt-Entwürfe</h1>
          <p className="text-sm text-muted-foreground">
            Begonnene Wizard-Sitzungen, die du später fortsetzen kannst.
          </p>
        </div>
        <Button onClick={() => router.push("/projects/new/wizard")}>
          <FilePlus2 className="mr-2 h-4 w-4" aria-hidden /> Neuen Entwurf starten
        </Button>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              Du hast aktuell keine offenen Entwürfe.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push("/projects/new/wizard")}
            >
              Mit dem Wizard starten
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {drafts.map((draft) => (
            <Card key={draft.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    {draft.name ?? "Unbenannter Entwurf"}
                  </CardTitle>
                  <CardDescription>
                    Zuletzt bearbeitet {formatRelative(draft.updated_at)}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/projects/new/wizard?draftId=${encodeURIComponent(draft.id)}`
                      )
                    }
                  >
                    Fortsetzen
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Entwurf verwerfen"
                    onClick={() => onDiscard(draft.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-xs">
                {draft.project_type ? (
                  <Badge variant="secondary">
                    {PROJECT_TYPE_LABELS[draft.project_type]}
                  </Badge>
                ) : (
                  <Badge variant="outline">Typ offen</Badge>
                )}
                {draft.project_method ? (
                  <Badge variant="secondary">
                    {PROJECT_METHOD_LABELS[draft.project_method]}
                  </Badge>
                ) : (
                  <Badge variant="outline">Methode offen</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
