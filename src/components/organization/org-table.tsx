"use client"

/**
 * PROJ-62 — flat table view of organization_units.
 *
 * Designed for sort/filter/bulk-edit use cases. Mirrors the same data
 * source as the Tree-View (`useOrganizationUnits`); changes here are
 * immediately visible there after refresh.
 */

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"

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
import { breadcrumbPath } from "@/lib/organization/tree-walk"
import {
  ORGANIZATION_UNIT_TYPE_LABELS,
  type Location,
  type OrganizationUnit,
} from "@/types/organization"

interface OrgTableProps {
  units: OrganizationUnit[]
  locations: Location[]
  loading: boolean
  canEdit: boolean
  onCreate: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function OrgTable({
  units,
  locations,
  loading,
  canEdit,
  onCreate,
  onEdit,
  onDelete,
}: OrgTableProps) {
  const sortedUnits = React.useMemo(
    () =>
      [...units].sort((a, b) =>
        a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
      ),
    [units],
  )

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sortedUnits.length}{" "}
          {sortedUnits.length === 1 ? "Einheit" : "Einheiten"}
        </p>
        {canEdit ? (
          <Button size="sm" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Neue Einheit
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Code</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead className="hidden lg:table-cell">
                Übergeordnet
              </TableHead>
              <TableHead className="hidden md:table-cell">Standort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUnits.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Noch keine Einheiten erfasst.
                </TableCell>
              </TableRow>
            ) : (
              sortedUnits.map((u) => {
                const path = breadcrumbPath(u.id, units)
                const parent =
                  path.length > 1 ? path.slice(0, -1).join(" › ") : "—"
                const location = u.location_id
                  ? locations.find((l) => l.id === u.location_id)
                  : null
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {u.code ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ORGANIZATION_UNIT_TYPE_LABELS[u.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {parent}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {location ? location.name : "—"}
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
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
                              <MoreHorizontal
                                className="h-4 w-4"
                                aria-hidden
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(u.id)}>
                              <Pencil
                                className="mr-2 h-3.5 w-3.5"
                                aria-hidden
                              />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDelete(u.id)}
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
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
