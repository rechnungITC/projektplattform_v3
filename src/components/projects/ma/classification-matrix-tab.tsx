"use client"

import { CheckCircle2, XCircle } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePhases } from "@/hooks/use-phases"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  type AccessExplain,
  fetchAccessExplain,
} from "@/lib/ma-project/advisor-nda-api"

import { ACCESS_REASON_LABEL, LEVEL_LABEL } from "./governance-labels"

type ObjectType = "project" | "phase" | "work_item"

// PROJ-129 — "Klassifikation": the richer M&A who-can-see-and-why matrix.
// Reads the access-explain RPC (manager-gated server-side) and shows, for the
// chosen object's confidentiality level, who is let through the need-to-know
// gate AND why (member / advisor / mandate / NDA / clearance). Read-only —
// never a second gate; rights still come from role + advisor/NDA/mandate +
// PROJ-100a clearance.
export function ClassificationMatrixTab({
  projectId,
  nameFor,
}: {
  projectId: string
  nameFor: (userId: string) => string
}) {
  const [objectType, setObjectType] = React.useState<ObjectType>("project")
  const [objectId, setObjectId] = React.useState<string>(projectId)
  const [data, setData] = React.useState<AccessExplain | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { phases } = usePhases(objectType === "phase" ? projectId : null)
  const { items: workItems } = useWorkItems(
    objectType === "work_item" ? projectId : null
  )

  const changeObjectType = (next: ObjectType) => {
    setObjectType(next)
    setObjectId(next === "project" ? projectId : "")
  }

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!objectId) {
        if (!cancelled) setData(null)
        return
      }
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetchAccessExplain(projectId, { objectType, objectId })
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Fehler beim Laden")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, objectType, objectId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wer darf was sehen — und warum?</CardTitle>
        <CardDescription>
          Für das gewählte Objekt zeigt die Matrix, wer das Need-to-know-Tor
          durchlässt und welcher Grund greift: Projektrolle, Advisor-Status,
          Mandat, NDA und Clearance. Read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44 space-y-1">
            <span className="text-xs text-muted-foreground">Objekt-Typ</span>
            <Select
              value={objectType}
              onValueChange={(v) => changeObjectType(v as ObjectType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Projekt</SelectItem>
                <SelectItem value="phase">Phase</SelectItem>
                <SelectItem value="work_item">Work-Item</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {objectType === "phase" && (
            <div className="min-w-[200px] flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Phase</span>
              <Select value={objectId} onValueChange={setObjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Phase wählen" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {objectType === "work_item" && (
            <div className="min-w-[200px] flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Work-Item</span>
              <Select value={objectId} onValueChange={setObjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Work-Item wählen" />
                </SelectTrigger>
                <SelectContent>
                  {workItems.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {data && (
            <Badge variant="outline" className="mb-1">
              Stufe:{" "}
              {LEVEL_LABEL[data.confidentiality_level] ??
                data.confidentiality_level}
            </Badge>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !objectId ? (
          <p className="text-sm text-muted-foreground">
            Wähle ein Objekt, um die Zugriffsübersicht zu sehen.
          </p>
        ) : !data || data.entries.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Keine relevanten Nutzer für dieses Objekt.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutzer</TableHead>
                  <TableHead>Zugriff</TableHead>
                  <TableHead>Grund</TableHead>
                  <TableHead className="hidden sm:table-cell">Extern</TableHead>
                  <TableHead className="hidden md:table-cell">Mandat</TableHead>
                  <TableHead className="hidden md:table-cell">NDA</TableHead>
                  <TableHead className="hidden sm:table-cell">Clearance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((e) => (
                  <TableRow key={e.user_id}>
                    <TableCell className="font-medium">
                      {nameFor(e.user_id)}
                    </TableCell>
                    <TableCell>
                      {e.has_access ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Zugriff</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Kein Zugriff</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ACCESS_REASON_LABEL[e.reason] ?? e.reason}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {e.is_external_advisor ? (
                        <Badge variant="outline">Extern</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {!e.is_external_advisor ? "n/a" : e.mandate_ok ? "OK" : "✗"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {!e.is_external_advisor ? "n/a" : e.nda_ok ? "OK" : "✗"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {e.cleared_level
                        ? (LEVEL_LABEL[e.cleared_level] ?? e.cleared_level)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}