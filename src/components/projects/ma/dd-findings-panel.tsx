"use client"

import { AlertTriangle, Loader2, Pencil, Plus, Microscope } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  acknowledgeFindingEscalation,
  createFinding,
  type CreateFindingPayload,
  type DdFinding,
  type DdFindingEscalation,
  type DdFindingsSummaryRow,
  type FindingSeverity,
  type FindingStatus,
  type FindingTreatment,
  fetchFindingsSummary,
  listFindingEscalations,
  listFindings,
  updateFinding,
} from "@/lib/ma-project/dd-findings-api"
import {
  type DdStream,
  listDdStreams,
} from "@/lib/ma-project/dd-streams-api"

import {
  fmtEur,
  FINDING_STATUS_LABEL,
  SEVERITY_LABEL,
  severityBadgeVariant,
  TREATMENT_LABEL,
} from "./dd-finding-labels"

const SEVERITIES: FindingSeverity[] = ["niedrig", "mittel", "hoch", "deal_breaker"]
const TREATMENTS: FindingTreatment[] = [
  "kaufpreisanpassung",
  "garantie",
  "freistellung",
  "integrationsthema",
  "akzeptiert",
]
const STATUSES: FindingStatus[] = ["open", "in_review", "resolved", "dismissed"]

// PROJ-114 — DD-Findings panel mounted below the DD-streams table. Findings are
// per-stream, quantifiable (EUR), and a deal_breaker classification escalates to
// Deal Lead + Sponsor (server-side). Read for project members (RLS + need-to-know
// gate); create/edit manager-gated (and enforced server-side).
export function DdFindingsPanel({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const [streams, setStreams] = React.useState<DdStream[]>([])
  const [findings, setFindings] = React.useState<DdFinding[]>([])
  const [summary, setSummary] = React.useState<DdFindingsSummaryRow[]>([])
  const [escalations, setEscalations] = React.useState<DdFindingEscalation[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; finding: DdFinding }
  >({ mode: "closed" })

  const streamLabel = React.useCallback(
    (id: string) => streams.find((s) => s.id === id)?.label ?? id.slice(0, 8),
    [streams]
  )

  const reload = React.useCallback(async () => {
    try {
      const [s, f, sum, esc] = await Promise.all([
        listDdStreams(projectId),
        listFindings(projectId),
        fetchFindingsSummary(projectId),
        listFindingEscalations(projectId, true),
      ])
      setStreams(s)
      setFindings(f)
      setSummary(sum)
      setEscalations(esc)
    } catch (err) {
      toast.error("DD-Findings konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [s, f, sum, esc] = await Promise.all([
          listDdStreams(projectId),
          listFindings(projectId),
          fetchFindingsSummary(projectId),
          listFindingEscalations(projectId, true),
        ])
        if (!cancelled) {
          setStreams(s)
          setFindings(f)
          setSummary(sum)
          setEscalations(esc)
        }
      } catch (err) {
        if (!cancelled)
          toast.error("DD-Findings konnten nicht geladen werden", {
            description: err instanceof Error ? err.message : "Unbekannter Fehler",
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const totalEur = summary.reduce((acc, r) => acc + Number(r.eur_sum || 0), 0)
  const dealBreakerCount = findings.filter((f) => f.severity === "deal_breaker").length

  const handleAck = async (esc: DdFindingEscalation) => {
    try {
      await acknowledgeFindingEscalation(projectId, esc.id)
      toast.success("Eskalation bestätigt")
      await reload()
    } catch (err) {
      toast.error("Bestätigung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Deal-breaker escalations awaiting acknowledgement */}
      {escalations.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden /> Deal-Breaker-Eskalationen
            </CardTitle>
            <CardDescription>
              Offene Hinweise an Deal Lead / Sponsor. Bestätigen, sobald zur Kenntnis genommen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {escalations.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <Badge variant="destructive" className="mr-2">
                    {e.role === "deal_lead" ? "Deal Lead" : "Sponsor"}
                  </Badge>
                  Finding in Stream {streamLabel(
                    findings.find((f) => f.id === e.finding_id)?.dd_stream_id ?? ""
                  )}
                </span>
                <Button size="sm" variant="outline" onClick={() => handleAck(e)}>
                  Bestätigen
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Microscope className="h-5 w-5" aria-hidden /> DD-Findings
            </CardTitle>
            <CardDescription>
              Befunde je Stream, nach Schwere bewertet und – wo möglich – in EUR
              quantifiziert. Kaufpreis-Risiko (Summe): <strong>{fmtEur(totalEur)}</strong>
              {dealBreakerCount > 0 && (
                <>
                  {" · "}
                  <span className="text-destructive">{dealBreakerCount} Deal Breaker</span>
                </>
              )}
            </CardDescription>
          </div>
          {canManage && streams.length > 0 && (
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Finding
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : streams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Erst DD-Streams aktivieren, dann lassen sich Findings erfassen.
            </p>
          ) : findings.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              Noch keine Findings erfasst.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Schwere</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">EUR</TableHead>
                    <TableHead className="hidden md:table-cell">Behandlung</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    {canManage && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findings.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.title}</TableCell>
                      <TableCell className="text-muted-foreground">{streamLabel(f.dd_stream_id)}</TableCell>
                      <TableCell>
                        <Badge variant={severityBadgeVariant(f.severity)}>
                          {SEVERITY_LABEL[f.severity]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right">
                        {fmtEur(f.economic_impact_eur)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {f.recommended_treatment ? TREATMENT_LABEL[f.recommended_treatment] : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {FINDING_STATUS_LABEL[f.status]}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Finding bearbeiten"
                            onClick={() => setDialog({ mode: "edit", finding: f })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialog.mode !== "closed" && (
        <FindingDialog
          projectId={projectId}
          streams={streams}
          finding={dialog.mode === "edit" ? dialog.finding : null}
          onClose={() => setDialog({ mode: "closed" })}
          onSaved={async () => {
            setDialog({ mode: "closed" })
            await reload()
          }}
        />
      )}
    </div>
  )
}

function FindingDialog({
  projectId,
  streams,
  finding,
  onClose,
  onSaved,
}: {
  projectId: string
  streams: DdStream[]
  finding: DdFinding | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const isEdit = finding !== null
  const [streamId, setStreamId] = React.useState(finding?.dd_stream_id ?? streams[0]?.id ?? "")
  const [title, setTitle] = React.useState(finding?.title ?? "")
  const [description, setDescription] = React.useState(finding?.description ?? "")
  const [severity, setSeverity] = React.useState<FindingSeverity>(finding?.severity ?? "mittel")
  const [eur, setEur] = React.useState(
    finding?.economic_impact_eur != null ? String(finding.economic_impact_eur) : ""
  )
  const [treatment, setTreatment] = React.useState<FindingTreatment | "">(
    finding?.recommended_treatment ?? ""
  )
  const [status, setStatus] = React.useState<FindingStatus>(finding?.status ?? "open")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const eurNum = eur.trim() === "" ? null : Number(eur)
      if (eurNum !== null && (Number.isNaN(eurNum) || eurNum < 0)) {
        setError("EUR-Wert ungültig.")
        setSubmitting(false)
        return
      }
      if (isEdit && finding) {
        await updateFinding(projectId, finding.id, {
          title: title.trim(),
          description: description.trim() || null,
          severity,
          economic_impact_eur: eurNum,
          clear_eur: eurNum === null,
          recommended_treatment: treatment === "" ? null : treatment,
          status,
        })
        toast.success(
          severity === "deal_breaker" && finding.severity !== "deal_breaker"
            ? "Finding gespeichert — Deal Breaker eskaliert an Deal Lead & Sponsor"
            : "Finding gespeichert"
        )
      } else {
        const payload: CreateFindingPayload = {
          dd_stream_id: streamId,
          title: title.trim(),
          description: description.trim() || null,
          severity,
          economic_impact_eur: eurNum,
          recommended_treatment: treatment === "" ? null : treatment,
        }
        await createFinding(projectId, payload)
        toast.success(
          severity === "deal_breaker"
            ? "Finding erstellt — Deal Breaker eskaliert an Deal Lead & Sponsor"
            : "Finding erstellt"
        )
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Finding bearbeiten" : "Finding erfassen"}</DialogTitle>
            <DialogDescription>
              Befund bewerten und – wo möglich – wirtschaftlich quantifizieren. Ein
              Deal Breaker eskaliert automatisch an Deal Lead und Sponsor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isEdit && (
              <div className="space-y-2">
                <Label>Stream</Label>
                <Select value={streamId} onValueChange={setStreamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Stream wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {streams.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="f-title">Titel</Label>
              <Input
                id="f-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-desc">Sachverhalt (optional)</Label>
              <Textarea
                id="f-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={8000}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[150px] flex-1 space-y-2">
                <Label>Schwere</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as FindingSeverity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SEVERITY_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[150px] flex-1 space-y-2">
                <Label htmlFor="f-eur">EUR (optional)</Label>
                <Input
                  id="f-eur"
                  type="number"
                  min={0}
                  value={eur}
                  onChange={(e) => setEur(e.target.value)}
                  placeholder="z. B. 250000"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[180px] flex-1 space-y-2">
                <Label>Empfohlene Behandlung</Label>
                <Select
                  value={treatment === "" ? "__none" : treatment}
                  onValueChange={(v) => setTreatment(v === "__none" ? "" : (v as FindingTreatment))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {TREATMENTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TREATMENT_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEdit && (
                <div className="min-w-[150px] flex-1 space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as FindingStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {FINDING_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !title.trim() || (!isEdit && !streamId)}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
