"use client"

import { Download, Loader2, Plus, Trash2 } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useProjectMembers } from "@/hooks/use-project-members"
import type { DdStream } from "@/lib/ma-project/dd-streams-api"
import {
  createDdQuestion,
  type DdQuestion,
  type DdQuestionPriority,
  type DdQuestionStatus,
  ddQuestionsExportUrl,
  deleteDdQuestion,
  listDdQuestions,
  transitionDdQuestionStatus,
  updateDdQuestion,
} from "@/lib/ma-project/dd-questions-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

import { DD_LEVEL_LABEL, fmtDate, remainingTime } from "./dd-stream-labels"
import {
  allowedDdQuestionTransitions,
  DD_QUESTION_PRIORITY_LABEL,
  DD_QUESTION_STATUS_LABEL,
  ddPriorityBadgeVariant,
  ddQuestionStatusBadgeVariant,
} from "./dd-question-labels"

const STATUSES: DdQuestionStatus[] = [
  "open",
  "in_answering",
  "answered",
  "followup",
  "closed",
]
const PRIORITIES: DdQuestionPriority[] = ["low", "medium", "high"]
const LEVELS: MaConfidentialityLevel[] = ["standard", "confidential", "strict"]

// PROJ-113 — Q&A for a single DD stream. Questions are visible to project
// members (RLS hides ones above clearance); create/answer/status/delete need
// `edit` (server-enforced; canEdit gates the affordances). The "escalate to
// Finding" action is a disabled placeholder until PROJ-114.
export function DdQuestionsSheet({
  stream,
  projectId,
  canEdit,
  onOpenChange,
}: {
  stream: DdStream | null
  projectId: string
  canEdit: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { members } = useProjectMembers(projectId)
  const today = React.useMemo(() => new Date(), [])
  const [questions, setQuestions] = React.useState<DdQuestion[]>([])
  const [loading, setLoading] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detail, setDetail] = React.useState<DdQuestion | null>(null)

  const streamId = stream?.id ?? null

  const nameFor = React.useCallback(
    (userId: string | null) => {
      if (!userId) return "—"
      const m = members.find((x) => x.user_id === userId)
      return m?.profile?.display_name || m?.profile?.email || userId.slice(0, 8)
    },
    [members]
  )

  const reload = React.useCallback(async () => {
    if (!streamId) {
      setQuestions([])
      return
    }
    setLoading(true)
    try {
      setQuestions(
        await listDdQuestions(projectId, {
          streamId,
          status: statusFilter === "all" ? undefined : (statusFilter as DdQuestionStatus),
        })
      )
    } catch (err) {
      toast.error("Fragen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, streamId, statusFilter])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when sheet target or filter changes
    void reload()
  }, [reload])

  const handleStatus = async (q: DdQuestion, to: DdQuestionStatus) => {
    try {
      await transitionDdQuestionStatus(projectId, q.id, to)
      toast.success(`Status → ${DD_QUESTION_STATUS_LABEL[to]}`)
      await reload()
    } catch (err) {
      toast.error("Statuswechsel fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const handleDelete = async (q: DdQuestion) => {
    if (!window.confirm(`Frage „${q.title}“ löschen?`)) return
    try {
      await deleteDdQuestion(projectId, q.id)
      toast.success("Frage gelöscht")
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Sheet open={stream !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Fragen &amp; Antworten{stream ? ` — ${stream.label}` : ""}</SheetTitle>
          <SheetDescription>
            Q&amp;A-Prozess je DD-Stream. Sichtbarkeit folgt der
            Need-to-know-Stufe; der CSV-Export enthält nur die für Sie sichtbaren
            Fragen.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DD_QUESTION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-2">
            {streamId && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={ddQuestionsExportUrl(projectId, { streamId })}
                  download
                >
                  <Download className="mr-1 h-4 w-4" aria-hidden /> CSV
                </a>
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Frage erfassen
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : questions.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Keine Fragen{statusFilter !== "all" ? " mit diesem Status" : ""}.
          </div>
        ) : (
          <ul className="space-y-2">
            {questions.map((q) => {
              const rt = remainingTime(q.due_date, today)
              return (
                <li key={q.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => setDetail(q)}
                    >
                      {q.title}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={ddPriorityBadgeVariant(q.priority)}>
                        {DD_QUESTION_PRIORITY_LABEL[q.priority]}
                      </Badge>
                      {q.confidentiality_level !== "standard" && (
                        <Badge
                          variant={q.confidentiality_level === "strict" ? "destructive" : "secondary"}
                        >
                          {DD_LEVEL_LABEL[q.confidentiality_level]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {canEdit ? (
                      <QuestionStatusControl question={q} onTransition={handleStatus} />
                    ) : (
                      <Badge variant={ddQuestionStatusBadgeVariant(q.status)}>
                        {DD_QUESTION_STATUS_LABEL[q.status]}
                      </Badge>
                    )}
                    <span>Owner: {nameFor(q.responsible_user_id)}</span>
                    {q.addressee && <span>· An: {q.addressee}</span>}
                    <span>
                      · Frist: {fmtDate(q.due_date)}
                      {rt && (
                        <span className={rt.overdue ? " text-destructive" : ""}>
                          {" "}({rt.label})
                        </span>
                      )}
                    </span>
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-6 w-6"
                        aria-label="Frage löschen"
                        onClick={() => handleDelete(q)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {stream && (
          <QuestionCreateDialog
            open={createOpen}
            projectId={projectId}
            streamId={stream.id}
            members={members}
            onOpenChange={setCreateOpen}
            onSaved={() => {
              setCreateOpen(false)
              void reload()
            }}
          />
        )}

        <QuestionDetailDialog
          question={detail}
          projectId={projectId}
          canEdit={canEdit}
          onOpenChange={(open) => {
            if (!open) setDetail(null)
          }}
          onSaved={() => {
            setDetail(null)
            void reload()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

function QuestionStatusControl({
  question,
  onTransition,
}: {
  question: DdQuestion
  onTransition: (q: DdQuestion, to: DdQuestionStatus) => void
}) {
  const next = allowedDdQuestionTransitions(question.status)
  return (
    <Select
      value={question.status}
      onValueChange={(v) => {
        if (v !== question.status) onTransition(question, v as DdQuestionStatus)
      }}
    >
      <SelectTrigger className="h-7 w-[170px]" aria-label="Status ändern">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={question.status} disabled>
          {DD_QUESTION_STATUS_LABEL[question.status]}
        </SelectItem>
        {next.map((n) => (
          <SelectItem key={n} value={n}>
            → {DD_QUESTION_STATUS_LABEL[n]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function QuestionCreateDialog({
  open,
  projectId,
  streamId,
  members,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  projectId: string
  streamId: string
  members: ReturnType<typeof useProjectMembers>["members"]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [title, setTitle] = React.useState("")
  const [detail, setDetail] = React.useState("")
  const [addressee, setAddressee] = React.useState("")
  const [priority, setPriority] = React.useState<DdQuestionPriority>("medium")
  const [dueDate, setDueDate] = React.useState("")
  const [owner, setOwner] = React.useState("")
  const [level, setLevel] = React.useState<MaConfidentialityLevel>("standard")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset when dialog opens
    setTitle("")
    setDetail("")
    setAddressee("")
    setPriority("medium")
    setDueDate("")
    setOwner("")
    setLevel("standard")
    setError(null)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError("Titel ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createDdQuestion(projectId, {
        dd_stream_id: streamId,
        title: title.trim(),
        detail: detail.trim() || null,
        addressee: addressee.trim() || null,
        priority,
        due_date: dueDate || null,
        responsible_user_id: owner || null,
        confidentiality_level: level,
      })
      toast.success("Frage erfasst")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Frage erfassen</DialogTitle>
            <DialogDescription>
              Die Vertraulichkeitsstufe wird mindestens auf die des Streams
              angehoben (Need-to-know-Floor).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="q-title">Titel</Label>
              <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-detail">Detail (optional)</Label>
              <Textarea id="q-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={8000} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="q-addressee">Adressat (optional)</Label>
                <Input id="q-addressee" value={addressee} onChange={(e) => setAddressee(e.target.value)} placeholder="z. B. Verkäuferseite" maxLength={300} />
              </div>
              <div className="space-y-2">
                <Label>Priorität</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as DdQuestionPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{DD_QUESTION_PRIORITY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="q-due">Frist</Label>
                <Input id="q-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vertraulichkeit</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as MaConfidentialityLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>{DD_LEVEL_LABEL[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Owner (intern, optional)</Label>
              <Select value={owner || "__none"} onValueChange={(v) => setOwner(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Erfassen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QuestionDetailDialog({
  question,
  projectId,
  canEdit,
  onOpenChange,
  onSaved,
}: {
  question: DdQuestion | null
  projectId: string
  canEdit: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [answerText, setAnswerText] = React.useState("")
  const [answerLink, setAnswerLink] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!question) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync when target changes
    setAnswerText(question.answer_text ?? "")
    setAnswerLink(question.answer_link ?? "")
    setError(null)
  }, [question])

  const handleSaveAnswer = async () => {
    if (!question) return
    setSubmitting(true)
    setError(null)
    try {
      await updateDdQuestion(projectId, question.id, {
        answer_text: answerText.trim() || null,
        answer_link: answerLink.trim() || null,
      })
      toast.success("Antwort gespeichert")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={question !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{question?.title}</DialogTitle>
          <DialogDescription>
            {question?.detail || "Keine Detailbeschreibung."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="a-text">Antwort</Label>
            <Textarea
              id="a-text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={4}
              maxLength={8000}
              disabled={!canEdit}
              placeholder={canEdit ? "Antwort der Gegenseite erfassen…" : "—"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-link">Datenraum-Link (optional)</Label>
            <Input
              id="a-link"
              type="url"
              value={answerLink}
              onChange={(e) => setAnswerLink(e.target.value)}
              placeholder="https://…"
              maxLength={2000}
              disabled={!canEdit}
            />
          </div>
          {question?.answer_round && question.answer_round > 1 && (
            <p className="text-xs text-muted-foreground">
              Antwort-Runde {question.answer_round} (vorherige Runden im
              Änderungsverlauf).
            </p>
          )}

          {/* PROJ-114 placeholder — escalation activates once dd_findings exists. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Verfügbar mit DD-Findings (PROJ-114)"
          >
            Zu Finding eskalieren
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          {canEdit && (
            <Button type="button" onClick={handleSaveAnswer} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Antwort speichern
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
