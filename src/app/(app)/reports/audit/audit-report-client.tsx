"use client"

import { Download, FileSearch } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  buildExportUrl,
  fetchReports,
  type ReportFilter,
} from "@/lib/audit/api"
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  type AuditEntityType,
  type AuditLogEntry,
} from "@/types/audit"

type EntityFilter = "all" | AuditEntityType

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "string") return v
  return JSON.stringify(v)
}

export function AuditReportClient() {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  const [entityType, setEntityType] = React.useState<EntityFilter>("all")
  const [actorId, setActorId] = React.useState("")
  const [fieldName, setFieldName] = React.useState("")
  const [fromDate, setFromDate] = React.useState("")
  const [toDate, setToDate] = React.useState("")
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([])
  const [loading, setLoading] = React.useState(false)

  const buildFilter = React.useCallback((): ReportFilter | null => {
    if (!tenantId) return null
    const filter: ReportFilter = { tenant_id: tenantId, limit: 200 }
    if (entityType !== "all") filter.entity_type = entityType
    if (actorId.trim()) filter.actor_user_id = actorId.trim()
    if (fieldName.trim()) filter.field_name = fieldName.trim()
    if (fromDate) filter.from_date = new Date(fromDate).toISOString()
    if (toDate) filter.to_date = new Date(toDate + "T23:59:59").toISOString()
    return filter
  }, [tenantId, entityType, actorId, fieldName, fromDate, toDate])

  const onSearch = async () => {
    const filter = buildFilter()
    if (!filter) return
    try {
      setLoading(true)
      const list = await fetchReports(filter)
      setEntries(list)
      if (list.length === 0) {
        toast.info("Keine Einträge mit diesen Filtern.")
      }
    } catch (err) {
      toast.error("Audit-Bericht fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }

  const onExportCsv = () => {
    const filter = buildFilter()
    if (!filter) return
    const url = buildExportUrl({ ...filter, format: "csv" })
    // Open in a new tab so the browser downloads naturally; admin gate is
    // enforced server-side.
    window.open(url, "_blank")
  }

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Kein aktiver Mandant ausgewählt.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit-Bericht</h1>
        <p className="text-sm text-muted-foreground">
          Mandantenweite Änderungshistorie. Class-3-Felder werden im CSV-Export
          standardmäßig redaktioniert.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>
            Kombiniere die Filter, um die Liste einzugrenzen. Leer lassen =
            kein Filter auf diesem Feld.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="entity">Entity-Typ</Label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as EntityFilter)}
            >
              <SelectTrigger id="entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {AUDIT_ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {AUDIT_ENTITY_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="field">Feldname</Label>
            <Input
              id="field"
              placeholder="z. B. status"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="actor">Akteur (User-ID)</Label>
            <Input
              id="actor"
              placeholder="UUID"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="from">Von</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="to">Bis</Label>
            <Input
              id="to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="flex items-end gap-2">
            <Button onClick={() => void onSearch()} disabled={loading}>
              <FileSearch className="mr-2 h-4 w-4" aria-hidden /> Suchen
            </Button>
            <Button
              variant="outline"
              onClick={onExportCsv}
              disabled={loading || entries.length === 0}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Wann</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Feld</TableHead>
              <TableHead>Vorher</TableHead>
              <TableHead>Nachher</TableHead>
              <TableHead className="w-[120px]">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Filter setzen und „Suchen" drücken.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(e.changed_at).toLocaleString("de-DE")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {AUDIT_ENTITY_LABELS[e.entity_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.field_name}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-muted-foreground line-through">
                    {formatValue(e.old_value)}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate">
                    {formatValue(e.new_value)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.change_reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
