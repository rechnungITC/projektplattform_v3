"use client"

import { Loader2, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLocations } from "@/hooks/use-locations"
import type { Location } from "@/types/organization"

import { LocationEditDialog } from "./location-edit-dialog"

interface LocationTableProps {
  canEdit: boolean
}

export function LocationTable({ canEdit }: LocationTableProps) {
  const { locations, loading, error, create, patch, remove } = useLocations()
  const [editing, setEditing] = React.useState<Location | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(loc: Location) {
    setEditing(loc)
    setDialogOpen(true)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await remove(id)
      toast.success("Standort gelöscht.")
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e.code === "has_dependencies") {
        toast.error(
          "Standort wird noch von Organisationseinheiten verwendet.",
        )
      } else {
        toast.error(e.message ?? "Löschen fehlgeschlagen.")
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">
          Standorte konnten nicht geladen werden.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {locations.length}{" "}
          {locations.length === 1 ? "Standort" : "Standorte"}
        </p>
        {canEdit ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Neuer Standort
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Stadt</TableHead>
              <TableHead className="hidden lg:table-cell">Land</TableHead>
              <TableHead className="hidden lg:table-cell">Adresse</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  <MapPin
                    className="mx-auto mb-2 h-6 w-6 text-muted-foreground"
                    aria-hidden
                  />
                  Noch keine Standorte erfasst.
                </TableCell>
              </TableRow>
            ) : (
              locations
                .slice()
                .sort((a, b) =>
                  a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
                )
                .map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {l.city ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {l.country ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {l.address ?? "—"}
                    </TableCell>
                    <TableCell>
                      {l.is_active ? (
                        <Badge variant="outline" className="border-emerald-200">
                          Aktiv
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
                          Inaktiv
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Aktionen"
                            >
                              {deletingId === l.id ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <MoreHorizontal
                                  className="h-4 w-4"
                                  aria-hidden
                                />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(l)}>
                              <Pencil
                                className="mr-2 h-3.5 w-3.5"
                                aria-hidden
                              />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => void handleDelete(l.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2
                                className="mr-2 h-3.5 w-3.5"
                                aria-hidden
                              />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      <LocationEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onCreate={async (body) => {
          await create(body)
        }}
        onUpdate={async (id, body) => {
          await patch(id, body)
        }}
      />
    </div>
  )
}
