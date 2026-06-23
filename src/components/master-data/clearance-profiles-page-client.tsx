"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ClearanceProfileFormDialog } from "@/components/master-data/clearance-profile-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import {
  type ClearanceProfile,
  deleteClearanceProfile,
  listClearanceProfiles,
  updateClearanceProfile,
} from "@/lib/ma-project/clearance-profiles-api"

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; profile: ClearanceProfile }

const LEVEL_LABEL: Record<ClearanceProfile["granted_level"], string> = {
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}

export function ClearanceProfilesPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [profiles, setProfiles] = React.useState<ClearanceProfile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await listClearanceProfiles())
    } catch (err) {
      toast.error("Berechtigungsprofile konnten nicht geladen werden", {
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

  const handleDeactivate = async (profile: ClearanceProfile) => {
    if (
      !confirm(
        `Profil „${profile.name}" wirklich deaktivieren? Bestehende über dieses Profil vergebene Freischaltungen bleiben unverändert; das Profil ist danach nicht mehr anwendbar.`
      )
    )
      return
    try {
      await updateClearanceProfile(profile.id, { is_active: false })
      toast.success(`„${profile.name}" deaktiviert`)
      await reload()
    } catch (err) {
      toast.error("Deaktivieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const handleReactivate = async (profile: ClearanceProfile) => {
    try {
      await updateClearanceProfile(profile.id, { is_active: true })
      toast.success(`„${profile.name}" reaktiviert`)
      await reload()
    } catch (err) {
      toast.error("Reaktivieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const handleDelete = async (profile: ClearanceProfile) => {
    if (!confirm(`Profil „${profile.name}" endgültig löschen?`)) return
    try {
      await deleteClearanceProfile(profile.id)
      toast.success(`„${profile.name}" gelöscht`)
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Berechtigungsprofile
          </h1>
          <p className="text-sm text-muted-foreground">
            Vorgefertigte Need-to-know-Vorlagen (z. B. „DD-Stream Legal voll“).
            Beim Anwenden vergeben sie die hinterlegte Vertraulichkeitsstufe an
            einen Nutzer im Projekt. Tenant-weit; nur Admins verwalten sie.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Neues Profil
          </Button>
        )}
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {isAdmin
            ? "Noch keine Berechtigungsprofile. Lege das erste an, um Freischaltungen per Klick zu vergeben."
            : "Noch keine Berechtigungsprofile hinterlegt."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Beschreibung</TableHead>
                <TableHead>Stufe</TableHead>
                <TableHead className="text-right">Status</TableHead>
                {isAdmin && <TableHead className="w-[120px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id} className={p.is_active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="hidden sm:table-cell max-w-xs truncate text-muted-foreground">
                    {p.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={p.granted_level === "strict" ? "destructive" : "secondary"}
                    >
                      {LEVEL_LABEL[p.granted_level]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.is_active ? (
                      <Badge variant="secondary">Aktiv</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inaktiv
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDialog({ mode: "edit", profile: p })}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        {p.is_active ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeactivate(p)}
                            title="Deaktivieren"
                          >
                            <Trash2
                              className="h-3.5 w-3.5 text-destructive"
                              aria-hidden
                            />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReactivate(p)}
                              title="Reaktivieren"
                            >
                              Aktivieren
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(p)}
                              title="Endgültig löschen"
                            >
                              <Trash2
                                className="h-3.5 w-3.5 text-destructive"
                                aria-hidden
                              />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ClearanceProfileFormDialog
        open={dialog.mode !== "closed"}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initial={dialog.mode === "edit" ? dialog.profile : null}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={() => {
          void reload()
          setDialog({ mode: "closed" })
        }}
      />
    </div>
  )
}
