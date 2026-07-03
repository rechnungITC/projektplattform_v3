"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
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
import { useWorkstreams } from "@/hooks/use-workstreams"
import { MA_STANDARD_ROLES } from "@/lib/project-types/catalog"
import {
  addDeliverableDocument,
  clearDeliverableRaci,
  createDeliverable,
  deleteDeliverableDocument,
  getDeliverable,
  listDeliverableRaci,
  setDeliverableRaci,
  updateDeliverable,
  type DeliverableRaciRow,
} from "@/lib/ma-project/deliverables-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { Deliverable, DeliverableDocument } from "@/types/deliverable"

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
  const [newRaciRole, setNewRaciRole] = React.useState("")
  const [newRaciLetter, setNewRaciLetter] = React.useState<"R" | "A" | "C" | "I">("R")

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
        }
        return
      }
      try {
        const [detail, raciRows] = await Promise.all([
          getDeliverable(projectId, item.id),
          listDeliverableRaci(projectId, item.id),
        ])
        if (!cancelled) {
          setDocs(detail.documents)
          setRaci(raciRows)
        }
      } catch {
        if (!cancelled) {
          setDocs([])
          setRaci([])
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
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="text-xs font-semibold">Dokumente (Links)</Label>
                  {docs.length === 0 && <p className="text-xs text-muted-foreground">Keine Links.</p>}
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <a href={d.url} target="_blank" rel="noreferrer" className="truncate text-primary underline">
                        {d.title}
                      </a>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removeDoc(d.id)} aria-label="Link entfernen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} placeholder="Titel" className="h-8" />
                    <Input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} placeholder="https://…" className="h-8" />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={addDoc} aria-label="Link hinzufügen">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

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
