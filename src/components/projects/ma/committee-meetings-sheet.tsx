"use client"

import { CalendarDays, Download, Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  addMeetingDocument,
  commitMeetingMinutes,
  committeeMeetingsIcsUrl,
  createCommitteeMeeting,
  getCommitteeMeeting,
  listCommitteeMeetings,
  removeMeetingAttendee,
  removeMeetingDocument,
  setMeetingAttendee,
  updateCommitteeMeeting,
  type AttendanceState,
  type CommitteeMeeting,
  type MeetingDetail,
  type MeetingStatus,
} from "@/lib/ma-project/committee-meetings-api"
import type { Committee } from "@/lib/ma-project/committees-api"

const STATUS_LABEL: Record<MeetingStatus, string> = {
  planned: "Geplant",
  held: "Gehalten",
  cancelled: "Abgesagt",
}
const ATTENDANCE_LABEL: Record<AttendanceState, string> = {
  present: "Anwesend",
  absent: "Abwesend",
  guest: "Gast",
}

interface Stakeholder {
  id: string
  name: string
}

interface Props {
  projectId: string
  committee: Committee
  stakeholders: Stakeholder[]
  canManage: boolean
  onClose: () => void
}

export function CommitteeMeetingsSheet({
  projectId,
  committee,
  stakeholders,
  canManage,
  onClose,
}: Props) {
  const [meetings, setMeetings] = React.useState<CommitteeMeeting[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [newTitle, setNewTitle] = React.useState("")
  const [newWhen, setNewWhen] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  // Manual reload for event handlers (not effects) — may setState synchronously.
  const reloadList = React.useCallback(async () => {
    setLoading(true)
    try {
      setMeetings(await listCommitteeMeetings(projectId, committee.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Termine konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }, [projectId, committee.id])

  // Initial load: await-first IIFE so no setState runs synchronously in the effect.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await listCommitteeMeetings(projectId, committee.id)
        if (!cancelled) setMeetings(rows)
      } catch (err) {
        if (!cancelled)
          toast.error(err instanceof Error ? err.message : "Termine konnten nicht geladen werden.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, committee.id])

  async function handleCreate() {
    if (!newTitle.trim() || !newWhen) return
    setCreating(true)
    try {
      const m = await createCommitteeMeeting(projectId, committee.id, {
        title: newTitle.trim(),
        scheduled_at: new Date(newWhen).toISOString(),
      })
      setNewTitle("")
      setNewWhen("")
      await reloadList()
      setSelectedId(m.id)
      toast.success("Termin angelegt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anlegen fehlgeschlagen.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" aria-hidden /> Termine — {committee.name}
          </SheetTitle>
          <SheetDescription>
            Regeltermine dieses Gremiums: Agenda, Teilnehmer, Protokoll, Beschlüsse
            und Maßnahmen. Beschlüsse landen im Entscheidungslog, Maßnahmen als
            Aufgaben.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button asChild variant="outline" size="sm">
              <a href={committeeMeetingsIcsUrl(projectId, committee.id)} download>
                <Download className="mr-2 h-4 w-4" aria-hidden /> ICS-Export
              </a>
            </Button>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="mtg-title" className="text-xs">Titel</Label>
                <Input
                  id="mtg-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="z. B. SteerCo Juli"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mtg-when" className="text-xs">Datum / Zeit</Label>
                <Input
                  id="mtg-when"
                  type="datetime-local"
                  value={newWhen}
                  onChange={(e) => setNewWhen(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={creating || !newTitle.trim() || !newWhen}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Termin
              </Button>
            </div>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
            </p>
          ) : meetings.length === 0 ? (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              Noch keine Termine.
            </p>
          ) : (
            <div className="space-y-1">
              {meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    m.id === selectedId ? "border-primary bg-muted/40" : ""
                  }`}
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.scheduled_at).toLocaleString("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <Badge variant="secondary">{STATUS_LABEL[m.status]}</Badge>
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedId && (
            <MeetingDetailPanel
              key={selectedId}
              projectId={projectId}
              committeeId={committee.id}
              meetingId={selectedId}
              stakeholders={stakeholders}
              canManage={canManage}
              onChanged={reloadList}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MeetingDetailPanel({
  projectId,
  committeeId,
  meetingId,
  stakeholders,
  canManage,
  onChanged,
}: {
  projectId: string
  committeeId: string
  meetingId: string
  stakeholders: Stakeholder[]
  canManage: boolean
  onChanged: () => Promise<void> | void
}) {
  const [detail, setDetail] = React.useState<MeetingDetail | null>(null)
  const [agenda, setAgenda] = React.useState("")
  const [minutes, setMinutes] = React.useState("")
  const [status, setStatus] = React.useState<MeetingStatus>("planned")
  const [saving, setSaving] = React.useState(false)
  const [addSh, setAddSh] = React.useState("")
  const [addAtt, setAddAtt] = React.useState<AttendanceState>("present")
  const [docLabel, setDocLabel] = React.useState("")
  const [docUrl, setDocUrl] = React.useState("")
  const [commitOpen, setCommitOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const d = await getCommitteeMeeting(projectId, committeeId, meetingId)
    setDetail(d)
    setAgenda(d.agenda ?? "")
    setMinutes(d.minutes ?? "")
    setStatus(d.status)
  }, [projectId, committeeId, meetingId])

  // Initial load: await-first IIFE (no synchronous setState in the effect).
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await getCommitteeMeeting(projectId, committeeId, meetingId)
        if (cancelled) return
        setDetail(d)
        setAgenda(d.agenda ?? "")
        setMinutes(d.minutes ?? "")
        setStatus(d.status)
      } catch (err) {
        if (!cancelled)
          toast.error(err instanceof Error ? err.message : "Termin konnte nicht geladen werden.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, committeeId, meetingId])

  if (!detail) {
    return (
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lädt Termin…
      </p>
    )
  }

  async function saveMeeting() {
    setSaving(true)
    try {
      await updateCommitteeMeeting(projectId, committeeId, meetingId, {
        agenda,
        minutes,
        status,
      })
      await load()
      await onChanged()
      toast.success("Termin gespeichert.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  async function addAttendee() {
    if (!addSh) return
    try {
      await setMeetingAttendee(projectId, committeeId, meetingId, {
        stakeholder_id: addSh,
        attendance: addAtt,
      })
      setAddSh("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Teilnehmer fehlgeschlagen.")
    }
  }

  async function addDoc() {
    if (!docLabel.trim() || !docUrl.trim()) return
    try {
      await addMeetingDocument(projectId, committeeId, meetingId, {
        label: docLabel.trim(),
        url: docUrl.trim(),
      })
      setDocLabel("")
      setDocUrl("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link fehlgeschlagen.")
    }
  }

  const shName = (id: string) => stakeholders.find((s) => s.id === id)?.name ?? id.slice(0, 8)

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as MeetingStatus)} disabled={!canManage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["planned", "held", "cancelled"] as MeetingStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="mtg-agenda" className="text-xs">Agenda</Label>
        <Textarea id="mtg-agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} disabled={!canManage} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mtg-minutes" className="text-xs">Protokoll (need-to-know-geschützt)</Label>
        <Textarea id="mtg-minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} rows={4} disabled={!canManage} />
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={saveMeeting} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCommitOpen(true)}>
            Protokoll festhalten (Beschlüsse &amp; Maßnahmen)
          </Button>
        </div>
      )}

      {/* Attendees */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Teilnehmer ({detail.attendees.length})</p>
        {detail.attendees.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
            <span>{a.stakeholder?.name ?? shName(a.stakeholder_id)}</span>
            <span className="flex items-center gap-2">
              <Badge variant="outline">{ATTENDANCE_LABEL[a.attendance]}</Badge>
              {canManage && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Teilnehmer entfernen"
                  onClick={async () => {
                    await removeMeetingAttendee(projectId, committeeId, meetingId, a.id)
                    await load()
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </span>
          </div>
        ))}
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Stakeholder</Label>
              <Select value={addSh} onValueChange={setAddSh}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {stakeholders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Anwesenheit</Label>
              <Select value={addAtt} onValueChange={(v) => setAddAtt(v as AttendanceState)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["present", "absent", "guest"] as AttendanceState[]).map((s) => (
                    <SelectItem key={s} value={s}>{ATTENDANCE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={addAttendee} disabled={!addSh}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Hinzufügen
            </Button>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Pre-Reads &amp; Anhänge ({detail.documents.length})</p>
        {detail.documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline">
              {d.label}
            </a>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Link entfernen"
                onClick={async () => {
                  await removeMeetingDocument(projectId, committeeId, meetingId, d.id)
                  await load()
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Bezeichnung</Label>
              <Input value={docLabel} onChange={(e) => setDocLabel(e.target.value)} placeholder="Board Deck" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…" />
            </div>
            <Button size="sm" variant="outline" onClick={addDoc} disabled={!docLabel.trim() || !docUrl.trim()}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Link
            </Button>
          </div>
        )}
      </div>

      {/* Outcomes */}
      {detail.outcomes.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Übernommen ({detail.outcomes.length})</p>
          <p className="text-xs text-muted-foreground">
            {detail.outcomes.filter((o) => o.outcome_type === "decision").length} Beschlüsse →
            Entscheidungslog, {detail.outcomes.filter((o) => o.outcome_type === "action").length}{" "}
            Maßnahmen → Aufgaben.
          </p>
        </div>
      )}

      {commitOpen && (
        <CommitMinutesDialog
          projectId={projectId}
          committeeId={committeeId}
          meetingId={meetingId}
          onClose={() => setCommitOpen(false)}
          onCommitted={async () => {
            setCommitOpen(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function CommitMinutesDialog({
  projectId,
  committeeId,
  meetingId,
  onClose,
  onCommitted,
}: {
  projectId: string
  committeeId: string
  meetingId: string
  onClose: () => void
  onCommitted: () => Promise<void> | void
}) {
  const [decisions, setDecisions] = React.useState<string[]>([""])
  const [actions, setActions] = React.useState<string[]>([""])
  const [submitting, setSubmitting] = React.useState(false)

  const cleanD = decisions.map((t) => t.trim()).filter(Boolean)
  const cleanA = actions.map((t) => t.trim()).filter(Boolean)

  async function submit() {
    if (cleanD.length === 0 && cleanA.length === 0) return
    setSubmitting(true)
    try {
      const res = await commitMeetingMinutes(projectId, committeeId, meetingId, {
        decisions: cleanD.map((title) => ({ title })),
        actions: cleanA.map((title) => ({ title })),
      })
      toast.success(
        `${res.decisions_created} Beschluss/Beschlüsse + ${res.actions_created} Maßnahme(n) übernommen.`
      )
      await onCommitted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Übernahme fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Protokoll festhalten</DialogTitle>
          <DialogDescription>
            Beschlüsse werden als unveränderbare Einträge ins Entscheidungslog
            übernommen, Maßnahmen als Aufgaben. Der vertrauliche Protokolltext
            bleibt am Termin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RowGroup label="Beschlüsse" values={decisions} onChange={setDecisions} />
          <RowGroup label="Maßnahmen (→ Aufgaben)" values={actions} onChange={setActions} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Abbrechen</Button>
          <Button onClick={submit} disabled={submitting || (cleanD.length === 0 && cleanA.length === 0)}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RowGroup({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {values.map((val, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={val}
            onChange={(e) => {
              const next = [...values]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder="Titel…"
          />
          {values.length > 1 && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zeile entfernen"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...values, ""])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Zeile
      </Button>
    </div>
  )
}
