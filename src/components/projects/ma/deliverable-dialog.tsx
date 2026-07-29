"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { usePhases } from "@/hooks/use-phases"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useWorkstreams } from "@/hooks/use-workstreams"
import { MA_STANDARD_ROLES } from "@/lib/project-types/catalog"
import { ExternalLinksSection } from "@/components/projects/ma/external-links-section"
import { listDeliverableApprovals } from "@/lib/ma-project/deliverable-approvals-api"
import {
  addDeliverableDocument,
  addDeliverableDocumentVersion,
  clearDeliverableRaci,
  createDeliverable,
  deleteDeliverableDocument,
  getDeliverable,
  listDeliverableRaci,
  setDeliverableRaci,
  stampDeliverableDocumentVersion,
  updateDeliverable,
  type DeliverableRaciRow,
} from "@/lib/ma-project/deliverables-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { Deliverable, DeliverableDocument } from "@/types/deliverable"
import type { DeliverableApprovalEvent } from "@/types/deliverable-approval-workflow"

const NONE = "__none__"
const LEVELS: { value: MaConfidentialityLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "confidential", label: "Vertraulich" },
  { value: "strict", label: "Streng vertraulich" },
]
const RACI_LETTERS = ["R", "A", "C", "I"] as const

const formSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(8000).optional().or(z.literal("")),
  phase_id: z.string().nullable(),
  workstream_id: z.string().nullable(),
  responsible_user_id: z.string().nullable(),
  due_date: z.string().nullable(),
  confidentiality_level: z.enum(["standard", "confidential", "strict"]),
})
type FormValues = z.infer<typeof formSchema>

interface DeliverableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item?: Deliverable | null
  onSaved: () => void | Promise<void>
}

export function DeliverableDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onSaved,
}: DeliverableDialogProps) {
  const { currentTenant } = useAuth()
  const { phases } = usePhases(projectId)
  const { workstreams } = useWorkstreams(projectId)
  const isEdit = Boolean(item)
  const [submitting, setSubmitting] = React.useState(false)

  const [docs, setDocs] = React.useState<DeliverableDocument[]>([])
  const [raci, setRaci] = React.useState<DeliverableRaciRow[]>([])
  const [newDocTitle, setNewDocTitle] = React.useState("")
  const [newDocUrl, setNewDocUrl] = React.useState("")
  // PROJ-106 — per-slot "new version" mini-form (verHeadId = the current head being versioned)
  const [verHeadId, setVerHeadId] = React.useState<string | null>(null)
  const [verTitle, setVerTitle] = React.useState("")
  const [verUrl, setVerUrl] = React.useState("")
  const [verComment, setVerComment] = React.useState("")
  // PROJ-106 AC5 — link a version to a completed approval decision (stamp).
  const [approvalEvents, setApprovalEvents] = React.useState<DeliverableApprovalEvent[]>([])
  const [stampHeadId, setStampHeadId] = React.useState<string | null>(null)
  const [stampEventId, setStampEventId] = React.useState("")
  const { members } = useTenantMembers(currentTenant?.id)
  const [newRaciRole, setNewRaciRole] = React.useState("")
  const [newRaciLetter, setNewRaciLetter] = React.useState<"R" | "A" | "C" | "I">("R")

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of members)
      m.set(mem.user_id, mem.display_name ?? mem.email.split("@")[0] ?? "—")
    return m
  }, [members])

  // PROJ-106 — group document versions into slots (chains). Each slot head is
  // the current version; the chain walks supersedes_document_id newest→oldest.
  const slots = React.useMemo(() => {
    const byId = new Map(docs.map((d) => [d.id, d]))
    return docs
      .filter((d) => d.is_current)
      .map((head) => {
        const chain: DeliverableDocument[] = []
        const seen = new Set<string>()
        let cur: DeliverableDocument | undefined = head
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id)
          chain.push(cur)
          cur = cur.supersedes_document_id
            ? byId.get(cur.supersedes_document_id)
            : undefined
        }
        return { head, chain }
      })
      .sort((a, b) => a.head.title.localeCompare(b.head.title))
  }, [docs])

  // PROJ-106 AC5 — resolve a linked approval event for display.
  const eventById = React.useMemo(
    () => new Map(approvalEvents.map((ev) => [ev.id, ev])),
    [approvalEvents]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      phase_id: null,
      workstream_id: null,
      responsible_user_id: null,
      due_date: null,
      confidentiality_level: "standard",
    },
  })
  const { reset } = form

  React.useEffect(() => {
    if (!open) return
    reset({
      name: item?.name ?? "",
      description: item?.description ?? "",
      phase_id: item?.phase_id ?? null,
      workstream_id: item?.workstream_id ?? null,
      responsible_user_id: item?.responsible_user_id ?? null,
      due_date: item?.due_date ?? null,
      confidentiality_level: item?.confidentiality_level ?? "standard",
    })
    let cancelled = false
    void (async () => {
      if (!item) {
        if (!cancelled) {
          setDocs([])
          setRaci([])
          setApprovalEvents([])
        }
        return
      }
      try {
        const [detail, raciRows, approvals] = await Promise.all([
          getDeliverable(projectId, item.id),
          listDeliverableRaci(projectId, item.id),
          // AC5: completed approval decisions of this deliverable, available to link a version to.
          listDeliverableApprovals(projectId, item.id).catch(() => []),
        ])
        if (!cancelled) {
          setDocs(detail.documents)
          setRaci(raciRows)
          setApprovalEvents(
            approvals
              .flatMap((a) => a.events ?? [])
              .filter((ev) => ev.event_type === "approved")
              .sort((x, y) => y.created_at.localeCompare(x.created_at))
          )
        }
      } catch {
        if (!cancelled) {
          setDocs([])
          setRaci([])
          setApprovalEvents([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, item, projectId, reset])

  async function onSubmit(values: FormValues) {
    if (!values.phase_id && !values.workstream_id) {
      toast.error("Mindestens eine Phase oder ein Workstream ist erforderlich.")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        phase_id: values.phase_id,
        workstream_id: values.workstream_id,
        responsible_user_id: values.responsible_user_id,
        due_date: values.due_date,
        confidentiality_level: values.confidentiality_level,
      }
      if (isEdit && item) await updateDeliverable(projectId, item.id, payload)
      else await createDeliverable(projectId, payload)
      toast.success(isEdit ? "Deliverable aktualisiert." : "Deliverable angelegt.")
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  async function addDoc() {
    if (!item || newDocTitle.trim().length === 0 || newDocUrl.trim().length === 0) return
    try {
      const doc = await addDeliverableDocument(projectId, item.id, {
        title: newDocTitle.trim(),
        url: newDocUrl.trim(),
      })
      setDocs((d) => [...d, doc])
      setNewDocTitle("")
      setNewDocUrl("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht hinzugefügt werden.")
    }
  }
  async function removeDoc(docId: string) {
    if (!item) return
    try {
      await deleteDeliverableDocument(projectId, item.id, docId)
      setDocs((d) => d.filter((x) => x.id !== docId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht entfernt werden.")
    }
  }
  // PROJ-106 — create a new version superseding the given current head.
  async function addVersion(headId: string) {
    if (!item || verTitle.trim().length === 0 || verUrl.trim().length === 0) return
    try {
      const created = await addDeliverableDocumentVersion(projectId, item.id, {
        title: verTitle.trim(),
        url: verUrl.trim(),
        supersedes_document_id: headId,
        version_comment: verComment.trim() || null,
      })
      // the superseded head is no longer current; append the new head
      setDocs((d) => [
        ...d.map((x) => (x.id === headId ? { ...x, is_current: false } : x)),
        created,
      ])
      setVerHeadId(null)
      setVerTitle("")
      setVerUrl("")
      setVerComment("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Neue Version fehlgeschlagen.")
    }
  }

  // PROJ-106 AC5 — link the current version to a completed approval decision (set-once).
  async function stampVersion(headId: string) {
    if (!item || !stampEventId) return
    try {
      const updated = await stampDeliverableDocumentVersion(projectId, item.id, {
        document_id: headId,
        event_id: stampEventId,
      })
      setDocs((d) => d.map((x) => (x.id === headId ? updated : x)))
      setStampHeadId(null)
      setStampEventId("")
      toast.success("Version mit Freigabe verknüpft.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verknüpfen fehlgeschlagen.")
    }
  }

  function eventLabel(ev: DeliverableApprovalEvent): string {
    return `Freigabe · ${new Date(ev.created_at).toLocaleDateString("de-DE")}`
  }

  async function addRaci() {
    if (!item || !newRaciRole) return
    try {
      await setDeliverableRaci(projectId, item.id, newRaciRole, newRaciLetter)
      setRaci(await listDeliverableRaci(projectId, item.id))
      setNewRaciRole("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "RACI konnte nicht gesetzt werden.")
    }
  }
  async function removeRaci(roleKey: string) {
    if (!item) return
    try {
      await clearDeliverableRaci(projectId, item.id, roleKey)
      setRaci((r) => r.filter((x) => x.role_key !== roleKey))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "RACI konnte nicht entfernt werden.")
    }
  }

  function roleLabel(key: string): string {
    return MA_STANDARD_ROLES.find((r) => r.key === key)?.label_de ?? key
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Deliverable bearbeiten" : "Neues Deliverable"}
          </DialogTitle>
          <DialogDescription>
            Katalog-Objekt mit Phase/Workstream, Verantwortlichem, Frist und Status.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="z. B. LOI, DD-Bericht, SPA" disabled={submitting} autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Beschreibung</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} disabled={submitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="phase_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={submitting}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Keine Phase</SelectItem>
                      {phases.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.sequence_number}. {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />

              <FormField control={form.control} name="workstream_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Workstream</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={submitting}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Kein Workstream</SelectItem>
                      {workstreams.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <p className="text-xs text-muted-foreground">Mindestens Phase oder Workstream wählen.</p>

            <FormField control={form.control} name="responsible_user_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Verantwortlich</FormLabel>
                <FormControl>
                  {currentTenant?.id ? (
                    <ResponsibleUserPicker tenantId={currentTenant.id} value={field.value ?? undefined}
                      onChange={(id) => field.onChange(id || null)} disabled={submitting} placeholder="Mitglied wählen" />
                  ) : <Input disabled placeholder="Kein Tenant" />}
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Solltermin</FormLabel>
                  <FormControl>
                    <Input type="date" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} disabled={submitting} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="confidentiality_level" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vertraulichkeit</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            {isEdit && (
              <>
                <div className="space-y-3 rounded-md border p-3">
                  <Label className="text-xs font-semibold">Dokumente &amp; Versionen</Label>
                  {slots.length === 0 && <p className="text-xs text-muted-foreground">Keine Dokumente.</p>}
                  {slots.map(({ head, chain }) => (
                    <div key={head.id} className="space-y-1.5 rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="shrink-0 gap-1 text-[11px]">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden /> v{head.version_no} · aktuell
                          </Badge>
                          <a href={head.url} target="_blank" rel="noreferrer" className="truncate text-primary underline">
                            {head.title}
                          </a>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => {
                              setVerHeadId(verHeadId === head.id ? null : head.id)
                              setVerTitle(head.title)
                              setVerUrl("")
                              setVerComment("")
                            }}>
                            Neue Version
                          </Button>
                          {!head.approved_in_event_id && approvalEvents.length > 0 && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                              onClick={() => {
                                setStampHeadId(stampHeadId === head.id ? null : head.id)
                                setStampEventId("")
                              }}>
                              Freigabe
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => removeDoc(head.id)} aria-label="Dokument entfernen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(head.created_at).toLocaleDateString("de-DE")}
                        {head.created_by && ` · ${userName.get(head.created_by) ?? "—"}`}
                        {head.approved_in_event_id &&
                          (eventById.has(head.approved_in_event_id)
                            ? ` · ${eventLabel(eventById.get(head.approved_in_event_id)!)}`
                            : " · mit Freigabe verknüpft")}
                        {head.version_comment && ` · „${head.version_comment}“`}
                      </p>
                      {chain.length > 1 && (
                        <div className="space-y-0.5 border-l pl-2">
                          {chain.slice(1).map((v) => (
                            <p key={v.id} className="text-[11px] text-muted-foreground">
                              <span className="line-through">v{v.version_no} {v.title}</span>
                              {" · "}{new Date(v.created_at).toLocaleDateString("de-DE")}
                              {v.created_by && ` · ${userName.get(v.created_by) ?? "—"}`}
                              {v.version_comment && ` · „${v.version_comment}“`}
                            </p>
                          ))}
                        </div>
                      )}
                      {verHeadId === head.id && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Input value={verTitle} onChange={(e) => setVerTitle(e.target.value)} placeholder="Titel" className="h-8 flex-1" />
                          <Input value={verUrl} onChange={(e) => setVerUrl(e.target.value)} placeholder="https://… (neue Version)" className="h-8 flex-1" />
                          <Input value={verComment} onChange={(e) => setVerComment(e.target.value)} placeholder="Kommentar" className="h-8 flex-1" />
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => addVersion(head.id)}>
                            Speichern
                          </Button>
                        </div>
                      )}
                      {stampHeadId === head.id && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Select value={stampEventId} onValueChange={setStampEventId}>
                            <SelectTrigger className="h-8 flex-1">
                              <SelectValue placeholder="Freigabeentscheidung wählen…" />
                            </SelectTrigger>
                            <SelectContent>
                              {approvalEvents.map((ev) => (
                                <SelectItem key={ev.id} value={ev.id}>{eventLabel(ev)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="outline" size="sm" className="h-8"
                            disabled={!stampEventId} onClick={() => stampVersion(head.id)}>
                            Verknüpfen
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} placeholder="Neues Dokument – Titel" className="h-8" />
                    <Input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} placeholder="https://…" className="h-8" />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={addDoc} aria-label="Dokument hinzufügen">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {item && (
                  <ExternalLinksSection
                    projectId={projectId}
                    entityType="deliverable"
                    entityId={item.id}
                    canEdit
                  />
                )}

                <div className="space-y-2 rounded-md border p-3">
                  <Label className="text-xs font-semibold">RACI</Label>
                  {raci.length === 0 && <p className="text-xs text-muted-foreground">Keine RACI-Zuordnung.</p>}
                  {raci.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span><span className="font-mono">{r.raci_letter}</span> — {roleLabel(r.role_key)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removeRaci(r.role_key)} aria-label="RACI entfernen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Select value={newRaciRole || NONE} onValueChange={(v) => setNewRaciRole(v === NONE ? "" : v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Rolle" /></SelectTrigger>
                      <SelectContent>
                        {MA_STANDARD_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label_de}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={newRaciLetter} onValueChange={(v) => setNewRaciLetter(v as "R" | "A" | "C" | "I")}>
                      <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RACI_LETTERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={addRaci} aria-label="RACI hinzufügen">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Abbrechen</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
