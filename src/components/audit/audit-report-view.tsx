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

/**
 * PROJ-130-γ3: das Register ist von 15 auf 88 Objektarten gewachsen. Das Array
 * ist nach technischem Namen sortiert; im Dropdown stehen aber die deutschen
 * Labels, die dann willkürlich geordnet wirkten. Einmal nach Label sortieren.
 */
const ENTITY_OPTIONS: readonly AuditEntityType[] = [...AUDIT_ENTITY_TYPES].sort(
  (a, b) => AUDIT_ENTITY_LABELS[a].localeCompare(AUDIT_ENTITY_LABELS[b], "de")
)

type EntityFilter = "all" | AuditEntityType

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "string") return v
  return JSON.stringify(v)
}

export interface AuditReportViewProps {
  /** Mandant, dessen Trail gezeigt wird. Kommt NICHT aus dem Sitzungskontext. */
  tenantId: string
  /**
   * Die Seitenüberschrift. Auf der Revisions-Sicht sitzt die Sicht in einer Karte
   * mit eigenem Titel — dort wäre eine zweite Überschrift Doppelung.
   */
  showHeading?: boolean
}

/**
 * PROJ-Y-130p — die filterbare Audit-Bericht-Sicht, herausgezogen aus der
 * Administrations-Seite.
 *
 * Der Mandant kommt als Prop, nicht aus `useAuth()`. Grund: die Revisions-Sicht
 * (PROJ-Y-130o) liegt außerhalb der App-Hülle, dort gibt es keinen Sitzungs-
 * Mandanten — ein Revisor ist bewusst kein Mitglied. Und wie schon bei der
 * Ketten-Darstellung gilt: EINE Sicht für beide Flächen, sonst driften sie und
 * dann zeigt die eine Fläche Einträge, die die andere verschweigt.
 *
 * Die Berechtigung steckt weiterhin nicht hier: die Berichts-Route hat kein
 * Mitgliedschafts-Gate, dort filtert ausschließlich RLS (`can_read_audit_entry`
 * inklusive des γ2-Zweigs für Revisions-Freigaben). Diese Sicht zeigt also, was
 * die Datenbank ohnehin herausgibt — nicht mehr.
 */
export function AuditReportView({
  tenantId,
  showHeading = true,
}: AuditReportViewProps) {

  const [entityType, setEntityType] = React.useState<EntityFilter>("all")
  const [actorId, setActorId] = React.useState("")
  const [fieldName, setFieldName] = React.useState("")
  const [fromDate, setFromDate] = React.useState("")
  const [toDate, setToDate] = React.useState("")
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([])
  // PROJ-Y-130h: bewusst unvollständiger Trail eines Test-Mandanten.
  const [lifecycleExempt, setLifecycleExempt] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const buildFilter = React.useCallback((): ReportFilter => {
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
    try {
      setLoading(true)
      const result = await fetchReports(filter)
      setEntries(result.entries)
      setLifecycleExempt(result.lifecycleExempt)
      if (result.entries.length === 0) {
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
    const url = buildExportUrl({ ...filter, format: "csv" })
    // Open in a new tab so the browser downloads naturally; admin gate is
    // enforced server-side.
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-6">
      {showHeading ? (
        <div>
          <h1 className="text-2xl font-semibold">Audit-Bericht</h1>
          <p className="text-sm text-muted-foreground">
            Mandantenweite Änderungshistorie. Class-3-Felder werden im CSV-Export
            standardmäßig redaktioniert.
          </p>
        </div>
      ) : null}

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
                {ENTITY_OPTIONS.map((t) => (
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

      {lifecycleExempt ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <p className="font-medium">Dieser Trail ist bewusst unvollständig</p>
          <p className="text-muted-foreground">
            Der Mandant ist von der Protokollierung von Anlage- und
            Löschvorgängen ausgenommen (Test-Mandant). Feldänderungen,
            Statuswechsel und Klassifikationsänderungen sind vollständig
            enthalten, Anlage und Löschung von Objekten fehlen. Exporte dieses
            Mandanten tragen denselben Hinweis.
          </p>
        </div>
      ) : null}

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
                  Filter setzen und „Suchen&ldquo; drücken.
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
