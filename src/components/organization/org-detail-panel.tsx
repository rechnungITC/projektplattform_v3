"use client"

import { Building2, MapPin, Pencil, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { breadcrumbPath } from "@/lib/organization/tree-walk"
import {
  ORGANIZATION_UNIT_TYPE_LABELS,
  type Location,
  type OrganizationUnit,
  type OrganizationUnitTreeNode,
} from "@/types/organization"

interface OrgDetailPanelProps {
  /** Selected node from the tree (with counts). */
  node: OrganizationUnitTreeNode | null
  /** Flat list for breadcrumb computation. */
  allUnits: OrganizationUnit[]
  locations: Location[]
  canEdit: boolean
  onClose: () => void
  onEdit: (unit: OrganizationUnit) => void
  onDelete: (unit: OrganizationUnit) => void
}

export function OrgDetailPanel({
  node,
  allUnits,
  locations,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: OrgDetailPanelProps) {
  if (!node) return null

  const breadcrumb = breadcrumbPath(node.id, allUnits)
  const location = node.location_id
    ? locations.find((l) => l.id === node.location_id)
    : null

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{node.name}</span>
          </CardTitle>
          <CardDescription className="mt-1 truncate">
            {breadcrumb.length > 1
              ? breadcrumb.slice(0, -1).join(" › ")
              : "Wurzel-Einheit"}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Detail-Panel schließen"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {ORGANIZATION_UNIT_TYPE_LABELS[node.type]}
          </Badge>
          {node.code ? <Badge variant="outline">{node.code}</Badge> : null}
          {!node.is_active ? (
            <Badge variant="destructive">Inaktiv</Badge>
          ) : null}
        </div>

        {node.description ? (
          <p className="text-sm text-muted-foreground">{node.description}</p>
        ) : null}

        <Separator />

        <dl className="grid grid-cols-3 gap-2 text-sm">
          <dt className="text-muted-foreground">Standort</dt>
          <dd className="col-span-2 flex items-center gap-1.5">
            {location ? (
              <>
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {location.name}
                {location.city ? ` — ${location.city}` : ""}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>

          <dt className="text-muted-foreground">Untereinheiten</dt>
          <dd className="col-span-2">{node.counts.children}</dd>

          <dt className="text-muted-foreground">Stakeholder</dt>
          <dd className="col-span-2">{node.counts.stakeholders}</dd>

          <dt className="text-muted-foreground">Ressourcen</dt>
          <dd className="col-span-2">{node.counts.resources}</dd>

          <dt className="text-muted-foreground">Tenant-Mitglieder</dt>
          <dd className="col-span-2">{node.counts.tenant_members}</dd>
        </dl>

        {canEdit ? (
          <>
            <Separator />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onEdit(node)}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
                Bearbeiten
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete(node)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
