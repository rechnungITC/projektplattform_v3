"use client"

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  OrganizationImport,
  OrganizationImportReportRow,
} from "@/types/organization-import"

import { ImportCommitModal } from "./import-commit-modal"

interface ImportPreviewStepProps {
  importRow: OrganizationImport
  committing: boolean
  onBack: () => void
  onCommit: () => Promise<void>
}

type Filter = "all" | "errors" | "warnings" | "duplicates"

export function ImportPreviewStep({
  importRow,
  committing,
  onBack,
  onCommit,
}: ImportPreviewStepProps) {
  const [filter, setFilter] = React.useState<Filter>("all")
  const rows = importRow.report.rows
  const filtered = rows.filter((row) => {
    if (filter === "errors") return row.errors.length > 0
    if (filter === "warnings") return row.warnings.length > 0
    if (filter === "duplicates") return row.status === "duplicate"
    return true
  })
  const commitDisabled = importRow.row_count_errored > 0 || committing

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Import-Vorschau
          </h2>
          <p className="text-sm text-muted-foreground">
            {importRow.original_filename}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-sm sm:min-w-[420px]">
          <Metric label="Zeilen" value={importRow.report.summary.total} />
          <Metric label="OK" value={importRow.report.summary.valid} />
          <Metric label="Warnungen" value={importRow.report.summary.warnings} />
          <Metric label="Fehler" value={importRow.report.summary.errored} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="errors">Fehler</TabsTrigger>
            <TabsTrigger value="warnings">Warnungen</TabsTrigger>
            <TabsTrigger value="duplicates">Duplikate</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={committing}>
            Zurück
          </Button>
          <ImportCommitModal
            disabled={commitDisabled}
            importing={committing}
            rowCount={rows.length - importRow.row_count_errored}
            onConfirm={onCommit}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <ScrollArea className="h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Zeile</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead>Datensatz</TableHead>
                <TableHead>Hinweise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Keine Zeilen.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={`${row.entity}-${row.row}`}>
                    <TableCell className="text-xs">{row.row}</TableCell>
                    <TableCell>
                      <StatusBadge row={row} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {primaryLabel(row)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.entity}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {[...row.errors, ...row.warnings].map((issue) => (
                        <div key={`${issue.code}-${issue.field ?? ""}`}>
                          {issue.field ? `${issue.field}: ` : ""}
                          {issue.message}
                        </div>
                      ))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function StatusBadge({ row }: { row: OrganizationImportReportRow }) {
  if (row.errors.length > 0) {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        <XCircle className="mr-1 h-3 w-3" aria-hidden />
        Fehler
      </Badge>
    )
  }
  if (row.warnings.length > 0 || row.status === "duplicate") {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700">
        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
        Warnung
      </Badge>
    )
  }
  if (row.status === "imported" || row.status === "updated") {
    return (
      <Badge variant="outline" className="border-emerald-300 text-emerald-700">
        <Loader2 className="mr-1 h-3 w-3" aria-hidden />
        Geschrieben
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-700">
      <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
      Valide
    </Badge>
  )
}

function primaryLabel(row: OrganizationImportReportRow): string {
  if (row.entity === "person_assignment") {
    return String(row.values.email ?? "")
  }
  if (row.entity === "location") {
    return `${row.values.location_code ?? ""} ${row.values.name ?? ""}`.trim()
  }
  return `${row.values.unit_code ?? ""} ${row.values.name ?? ""}`.trim()
}
