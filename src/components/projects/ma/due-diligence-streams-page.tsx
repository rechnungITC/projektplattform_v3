"use client"

import { Loader2, Microscope, Pencil, Plus, Trash2 } from "lucide-react"
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
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useProjectMembers } from "@/hooks/use-project-members"
import {
  createDdStream,
  type DdStream,
  type DdStreamStatus,
  deleteDdStream,
  listDdStreams,
  listDdStreamTemplates,
  transitionDdStreamStatus,
  updateDdStream,
} from "@/lib/ma-project/dd-streams-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

import {
  allowedDdTransitions,
  DD_LEVEL_LABEL,
  DD_STATUS_LABEL,
  ddStatusBadgeVariant,
  fmtDate,
  remainingTime,
} from "./dd-stream-labels"

const LEVELS: MaConfidentialityLevel[] = ["standard", "confidential", "strict"]

// PROJ-112 — Due-Diligence overview for an M&A project. Streams are visible to
// project members (RLS-scoped); activation/edit/status are manager-gated
// (tenant-admin or project lead) — both in the UI and server-side. The "open
// findings / open Q&A" columns are forward-compatible: the API returns null
// until PROJ-113/114 land, so we render "—" (never a misleading 0).
export function DueDiligenceStreamsPage({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const { members } = useProjectMembers(projectId)
  const today = React.useMemo(() => new Date(), [])

  const [streams, setStreams] = React.useState<DdStream[]>([])
  const [loading, setLoading] = React.useState(true)
  const [activateOpen, setActivateOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DdStream | null>(null)

  const nameFor = React.useCallback(
    (userId: string | null) => {
      if (!userId) return "—"
      const m = members.find((x) => x.user_id === userId)
      return m?.profile?.display_name || m?.profile?.email || userId.slice(0, 8)
    },
    [members]
  )

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setStreams(await listDdStreams(projectId))
    } catch (err) {
      toast.error("DD-Streams konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  const handleStatus = async (stream: DdStream, to: DdStreamStatus) => {
    try {
      await transitionDdStreamStatus(projectId, stream.id, to)
      toast.success(`Status → ${DD_STATUS_LABEL[to]}`)
      await reload()
    } catch (err) {
      toast.error("Statuswechsel fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const handleDelete = async (stream: DdStream) => {
    if (!window.confirm(`DD-Stream „${stream.label}“ entfernen?`)) return
    try {
      await deleteDdStream(projectId, stream.id)
      toast.success("Stream entfernt")
      await reload()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Microscope className="h-5 w-5" aria-hidden /> Due-Diligence-Streams
          </CardTitle>
          <CardDescription>
            Steuere die DD-Streams (Commercial, Financial, Tax, Legal, HR, IT …)
            mit Stream-Lead, Zeitfenster, Status und Vertraulichkeitsstufe.
          </CardDescription>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setActivateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Stream aktivieren
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : streams.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Noch keine DD-Streams aktiviert.
            {canManage ? " Aktiviere den ersten aus der Vorlage." : ""}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Lead</TableHead>
                  <TableHead className="hidden lg:table-cell">Zeitfenster</TableHead>
                  <TableHead className="hidden sm:table-cell">Vertraulich</TableHead>
                  <TableHead className="text-center" title="Verfügbar mit DD-Findings (PROJ-114)">
                    Findings
                  </TableHead>
                  <TableHead className="text-center" title="Verfügbar mit DD-Q&A (PROJ-113)">
                    Q&amp;A
                  </TableHead>
                  {canManage && <TableHead className="w-[150px] text-right">Aktion</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((s) => {
                  const rt = remainingTime(s.planned_end, today)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <StatusControl stream={s} onTransition={handleStatus} />
                        ) : (
                          <Badge variant={ddStatusBadgeVariant(s.status)}>
                            {DD_STATUS_LABEL[s.status]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {nameFor(s.stream_lead_user_id)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {fmtDate(s.planned_start)} – {fmtDate(s.planned_end)}
                        {rt && (
                          <span className={rt.overdue ? "ml-2 text-destructive" : "ml-2"}>
                            ({rt.label})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge
                          variant={
                            s.confidentiality_level === "strict"
                              ? "destructive"
                              : s.confidentiality_level === "confidential"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {DD_LEVEL_LABEL[s.confidentiality_level]}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="text-center text-muted-foreground"
                        title="Verfügbar mit DD-Findings (PROJ-114)"
                      >
                        {s.open_findings ?? "—"}
                      </TableCell>
                      <TableCell
                        className="text-center text-muted-foreground"
                        title="Verfügbar mit DD-Q&A (PROJ-113)"
                      >
                        {s.open_questions ?? "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Stream bearbeiten"
                              onClick={() => setEditing(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Stream entfernen"
                              onClick={() => handleDelete(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ActivateStreamDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        projectId={projectId}
        existingKeys={streams.map((s) => s.stream_key)}
        onSaved={() => {
          setActivateOpen(false)
          void reload()
        }}
      />

      <EditStreamDialog
        stream={editing}
        projectId={projectId}
        members={members}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={() => {
          setEditing(null)
          void reload()
        }}
      />
    </Card>
  )
}

function StatusControl({
  stream,
  onTransition,
}: {
  stream: DdStream
  onTransition: (s: DdStream, to: DdStreamStatus) => void
}) {
  const next = allowedDdTransitions(stream.status)
  return (
    <Select
      value={stream.status}
      onValueChange={(v) => {
        if (v !== stream.status) onTransition(stream, v as DdStreamStatus)
      }}
    >
      <SelectTrigger className="h-8 w-[190px]" aria-label="Status ändern">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* current (disabled) + allowed next states */}
        <SelectItem value={stream.status} disabled>
          {DD_STATUS_LABEL[stream.status]}
        </SelectItem>
        {next.map((n) => (
          <SelectItem key={n} value={n}>
            → {DD_STATUS_LABEL[n]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ActivateStreamDialog({
  open,
  onOpenChange,
  projectId,
  existingKeys,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  existingKeys: string[]
  onSaved: () => void
}) {
  const [templates, setTemplates] = React.useState<
    { stream_key: string; label: string }[]
  >([])
  const [loading, setLoading] = React.useState(false)
  const [streamKey, setStreamKey] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    setStreamKey("")
    setError(null)
    setLoading(true)
    try {
      const all = await listDdStreamTemplates()
      setTemplates(
        all
          .filter((t) => t.is_active && !existingKeys.includes(t.stream_key))
          .map((t) => ({ stream_key: t.stream_key, label: t.label }))
      )
    } catch (err) {
      toast.error("Vorlagen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [existingKeys])

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch when the dialog opens
    void reload()
  }, [open, reload])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const tpl = templates.find((t) => t.stream_key === streamKey)
    if (!tpl) {
      setError("Bitte eine Vorlage wählen.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createDdStream(projectId, { stream_key: tpl.stream_key, label: tpl.label })
      toast.success(`Stream „${tpl.label}“ aktiviert`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktivieren fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>DD-Stream aktivieren</DialogTitle>
            <DialogDescription>
              Wähle einen Stream aus der Tenant-Vorlage. Vorlagen pflegst du unter
              Stammdaten → DD-Stream-Vorlagen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label>Stream-Vorlage</Label>
            <Select value={streamKey} onValueChange={setStreamKey}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Lädt …" : "Vorlage wählen"} />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {loading ? "Lädt …" : "Alle Vorlagen bereits aktiviert"}
                  </SelectItem>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.stream_key} value={t.stream_key}>
                      {t.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !streamKey}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Aktivieren
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditStreamDialog({
  stream,
  projectId,
  members,
  onOpenChange,
  onSaved,
}: {
  stream: DdStream | null
  projectId: string
  members: ReturnType<typeof useProjectMembers>["members"]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { phases } = usePhases(stream ? projectId : null)
  const [lead, setLead] = React.useState("")
  const [start, setStart] = React.useState("")
  const [end, setEnd] = React.useState("")
  const [level, setLevel] = React.useState<MaConfidentialityLevel>("standard")
  const [phaseId, setPhaseId] = React.useState("")
  const [scope, setScope] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!stream) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form sync when the target changes
    setError(null)
    setLead(stream.stream_lead_user_id ?? "")
    setStart(stream.planned_start ?? "")
    setEnd(stream.planned_end ?? "")
    setLevel(stream.confidentiality_level)
    setPhaseId(stream.phase_id ?? "")
    setScope(stream.scope ?? "")
    setNotes(stream.notes ?? "")
  }, [stream])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stream) return
    setSubmitting(true)
    setError(null)
    try {
      await updateDdStream(projectId, stream.id, {
        stream_lead_user_id: lead || null,
        planned_start: start || null,
        planned_end: end || null,
        confidentiality_level: level,
        phase_id: phaseId || null,
        scope: scope.trim() || null,
        notes: notes.trim() || null,
      })
      toast.success("Stream aktualisiert")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={stream !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{stream ? `Stream: ${stream.label}` : ""}</DialogTitle>
            <DialogDescription>
              Stream-Lead, Zeitfenster, Vertraulichkeit und Scope. Der Status wird
              über die Status-Auswahl in der Übersicht geändert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Stream-Lead</Label>
              <Select value={lead || "__none"} onValueChange={(v) => setLead(v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— keine —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.display_name || m.profile?.email || m.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dd-start">Beginn</Label>
                <Input id="dd-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dd-end">Ende</Label>
                <Input id="dd-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vertraulichkeit</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as MaConfidentialityLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {DD_LEVEL_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phase (optional)</Label>
                <Select value={phaseId || "__none"} onValueChange={(v) => setPhaseId(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Keine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— keine —</SelectItem>
                    {phases.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dd-scope">Scope (optional)</Label>
              <Input
                id="dd-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="z. B. Zielgesellschaft DE + AT"
                maxLength={4000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dd-notes">Notizen (optional)</Label>
              <Textarea
                id="dd-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={4000}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
