"use client"

import { Download, Search, Users2 } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStakeholderRollup } from "@/hooks/use-stakeholder-rollup"
import { stakeholderCsvUrl } from "@/lib/master-data/api"

export function StakeholderRollupClient() {
  const [activeOnly, setActiveOnly] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [orgUnit, setOrgUnit] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")

  // Debounce search input so we don't fire a request on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const options = React.useMemo(
    () => ({
      active_only: activeOnly,
      org_unit: orgUnit.trim() || undefined,
      search: debouncedSearch || undefined,
    }),
    [activeOnly, orgUnit, debouncedSearch]
  )

  const { rows, loading, error } = useStakeholderRollup(options)

  function exportCsv() {
    const url = stakeholderCsvUrl(options)
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users2 className="h-6 w-6" aria-hidden />
            Stakeholder-Rollup
          </h1>
          <p className="text-sm text-muted-foreground">
            Tenant-weite Übersicht aller Stakeholder. Eine Zeile pro
            Stakeholder-Eintrag (also pro Person × Projekt). Read-only —
            Pflege bleibt im Projektraum. CSV-Export redaktiert
            Klasse-3-Felder (E-Mail, Telefon).
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" aria-hidden /> CSV
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="search">Suche (Name)</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Anna …"
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-44">
          <Label htmlFor="org_unit">Org-Einheit</Label>
          <Input
            id="org_unit"
            value={orgUnit}
            onChange={(e) => setOrgUnit(e.target.value)}
            placeholder="IT, Vertrieb, …"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
          Nur aktive
        </label>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Stakeholder …</p>
      ) : error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Keine Stakeholder im gewählten Filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Org-Einheit</TableHead>
                <TableHead className="text-right">Einfluss</TableHead>
                <TableHead className="text-right">Wirkung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Projekt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.role_key}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.org_unit ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.influence ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.impact ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.is_active ? (
                      <Badge variant="default">Aktiv</Badge>
                    ) : (
                      <Badge variant="secondary">Inaktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.project_name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} Eintrag{rows.length === 1 ? "" : "e"} angezeigt.
      </p>
    </div>
  )
}
