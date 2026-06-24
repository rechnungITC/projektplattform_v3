"use client"

import { FileText, Loader2, Plus, Trash2, Users } from "lucide-react"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import {
  assignNda,
  createNda,
  deleteNda,
  deleteNdaAssignment,
  listNdaAssignments,
  listNdas,
  type Nda,
  type NdaAssignment,
  type NdaScopeKind,
  type NdaStatus,
  updateNda,
} from "@/lib/ma-project/advisor-nda-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

import {
  fmtDate,
  type GovernanceMember,
  LEVEL_LABEL,
  NDA_SCOPE_LABEL,
  NDA_STATUS_LABEL,
  ndaBadgeVariant,
} from "./governance-labels"

const NDA_STATUSES = Object.keys(NDA_STATUS_LABEL) as NdaStatus[]
const NDA_SCOPES = Object.keys(NDA_SCOPE_LABEL) as NdaScopeKind[]
const LEVELS = Object.keys(LEVEL_LABEL) as MaConfidentialityLevel[]

// PROJ-128 — "NDAs": the NDA register as a governance object. For external
// advisors a valid, in-window, scope-matching NDA is a hard precondition for
// clearance above `standard` (enforced server-side in can_access_classified).
// This UI manages register entries + person/org assignments + document link.
export function NdasTab({
  projectId,
  members,
  nameFor,
}: {
  projectId: string
  members: GovernanceMember[]
  nameFor: (userId: string) => string
}) {
  const [ndas, setNdas] = React.useState<Nda[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Nda | null>(null)
  const [assignmentsFor, setAssignmentsFor] = React.useState<Nda | null>(null)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setNdas(await listNdas(projectId))
    } catch (err) {
      toast.error("NDAs konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // F-2 (QA followup): guarded mount fetch — see advisors-tab. reload() stays
  // for user-initiated post-mutation refetches.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await listNdas(projectId)
        if (!cancelled) setNdas(list)
      } catch (err) {
        if (!cancelled)
          toast.error("NDAs konnten nicht geladen werden", {
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

  const handleDelete = async (nda: Nda) => {
    if (!window.confirm(`NDA „${nda.counterparty}“ löschen?`)) return
    try {
      await deleteNda(projectId, nda.id)
      toast.success("NDA gelöscht")
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" aria-hidden /> NDA-Register
          </CardTitle>
          <CardDescription>
            Geheimhaltungsvereinbarungen mit Laufzeit, Scope und abgedeckter
            Vertraulichkeitsstufe. Nur eine gültige NDA öffnet externen Beratern
            vertraulichen Zugriff.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden /> NDA erfassen
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : ndas.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Noch keine NDAs erfasst.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vertragspartner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Deckt</TableHead>
                  <TableHead className="hidden md:table-cell">Scope</TableHead>
                  <TableHead className="hidden lg:table-cell">Gültig bis</TableHead>
                  <TableHead className="w-32 text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ndas.map((nda) => (
                  <TableRow key={nda.id}>
                    <TableCell className="font-medium">
                      {nda.counterparty}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ndaBadgeVariant(nda.status)}>
                        {NDA_STATUS_LABEL[nda.status] ?? nda.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {LEVEL_LABEL[nda.covered_level] ?? nda.covered_level}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {NDA_SCOPE_LABEL[nda.scope_kind] ?? nda.scope_kind}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {fmtDate(nda.valid_until)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Personen zuordnen"
                          onClick={() => setAssignmentsFor(nda)}
                        >
                          <Users className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(nda)
                            setDialogOpen(true)
                          }}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="NDA löschen"
                          onClick={() => handleDelete(nda)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <NdaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        initial={editing}
        members={members}
        onSaved={() => {
          setDialogOpen(false)
          void reload()
        }}
      />

      <NdaAssignmentsSheet
        nda={assignmentsFor}
        projectId={projectId}
        members={members}
        nameFor={nameFor}
        onOpenChange={(open) => {
          if (!open) setAssignmentsFor(null)
        }}
      />
    </Card>
  )
}

function NdaFormDialog({
  open,
  onOpenChange,
  projectId,
  initial,
  members,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  initial: Nda | null
  members: GovernanceMember[]
  onSaved: () => void
}) {
  const isEdit = initial !== null
  const [counterparty, setCounterparty] = React.useState("")
  const [status, setStatus] = React.useState<NdaStatus>("draft")
  const [coveredLevel, setCoveredLevel] =
    React.useState<MaConfidentialityLevel>("confidential")
  const [scopeKind, setScopeKind] = React.useState<NdaScopeKind>("project")
  const [scopeRef, setScopeRef] = React.useState("")
  const [responsibleUserId, setResponsibleUserId] = React.useState("")
  const [signedDate, setSignedDate] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [reminderDate, setReminderDate] = React.useState("")
  const [documentLink, setDocumentLink] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setError(null)
    if (initial) {
      setCounterparty(initial.counterparty)
      setStatus(initial.status)
      setCoveredLevel(initial.covered_level)
      setScopeKind(initial.scope_kind)
      setScopeRef(initial.scope_ref ?? "")
      setResponsibleUserId(initial.responsible_user_id ?? "")
      setSignedDate(initial.signed_date ?? "")
      setValidFrom(initial.valid_from ?? "")
      setValidUntil(initial.valid_until ?? "")
      setReminderDate(initial.reminder_date ?? "")
      setDocumentLink(initial.document_link ?? "")
      setNotes(initial.notes ?? "")
    } else {
      setCounterparty("")
      setStatus("draft")
      setCoveredLevel("confidential")
      setScopeKind("project")
      setScopeRef("")
      setResponsibleUserId("")
      setSignedDate("")
      setValidFrom("")
      setValidUntil("")
      setReminderDate("")
      setDocumentLink("")
      setNotes("")
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!counterparty.trim()) {
      setError("Vertragspartner ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        counterparty: counterparty.trim(),
        status,
        covered_level: coveredLevel,
        scope_kind: scopeKind,
        scope_ref: scopeRef.trim() || null,
        responsible_user_id: responsibleUserId || null,
        signed_date: signedDate || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        reminder_date: reminderDate || null,
        document_link: documentLink.trim() || null,
        notes: notes.trim() || null,
      }
      if (isEdit && initial) {
        await updateNda(projectId, initial.id, payload)
        toast.success("NDA aktualisiert")
      } else {
        await createNda(projectId, payload)
        toast.success("NDA erfasst")
      }
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
            <DialogTitle>{isEdit ? "NDA bearbeiten" : "NDA erfassen"}</DialogTitle>
            <DialogDescription>
              Verwaltungsobjekt — keine Klauselprüfung. Status, Laufzeit, Scope
              und Dokument-Link steuern das Zugriffs-Gate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nda-cp">Vertragspartner</Label>
              <Input
                id="nda-cp"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="z. B. Kanzlei Meyer & Partner / Target GmbH"
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as NdaStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NDA_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {NDA_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Deckt Stufe</Label>
                <Select
                  value={coveredLevel}
                  onValueChange={(v) =>
                    setCoveredLevel(v as MaConfidentialityLevel)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LEVEL_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Geltungsbereich</Label>
                <Select
                  value={scopeKind}
                  onValueChange={(v) => setScopeKind(v as NdaScopeKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NDA_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {NDA_SCOPE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nda-scoperef">Scope-Referenz (optional)</Label>
                <Input
                  id="nda-scoperef"
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder="z. B. Phase / DD-Stream"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Verantwortlich (intern)</Label>
              <Select
                value={responsibleUserId || "__none"}
                onValueChange={(v) =>
                  setResponsibleUserId(v === "__none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— keine —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nda-signed">Unterzeichnet</Label>
                <Input
                  id="nda-signed"
                  type="date"
                  value={signedDate}
                  onChange={(e) => setSignedDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nda-from">Gültig ab</Label>
                <Input
                  id="nda-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nda-until">Gültig bis</Label>
                <Input
                  id="nda-until"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nda-reminder">Wiedervorlage</Label>
                <Input
                  id="nda-reminder"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nda-link">Dokument-Link</Label>
                <Input
                  id="nda-link"
                  type="url"
                  value={documentLink}
                  onChange={(e) => setDocumentLink(e.target.value)}
                  placeholder="https://…"
                  maxLength={1000}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nda-notes">Notizen (optional)</Label>
              <Textarea
                id="nda-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>

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
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {isEdit ? "Speichern" : "Erfassen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NdaAssignmentsSheet({
  nda,
  projectId,
  members,
  nameFor,
  onOpenChange,
}: {
  nda: Nda | null
  projectId: string
  members: GovernanceMember[]
  nameFor: (userId: string) => string
  onOpenChange: (open: boolean) => void
}) {
  const [assignments, setAssignments] = React.useState<NdaAssignment[]>([])
  const [loading, setLoading] = React.useState(false)
  const [mode, setMode] = React.useState<"user" | "contact">("user")
  const [userId, setUserId] = React.useState("")
  const [contactName, setContactName] = React.useState("")
  const [contactOrg, setContactOrg] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  const ndaId = nda?.id ?? null

  // Resets the add-form + (re)fetches assignments for the current NDA. State is
  // set inside this async callback (not directly in the effect body) so the
  // react-hooks/set-state-in-effect rule stays satisfied.
  const reload = React.useCallback(async () => {
    setUserId("")
    setContactName("")
    setContactOrg("")
    setMode("user")
    if (!ndaId) {
      setAssignments([])
      return
    }
    setLoading(true)
    try {
      setAssignments(await listNdaAssignments(projectId, ndaId))
    } catch (err) {
      toast.error("Zuordnungen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, ndaId])

  // F-2 (QA followup): reset the add-form + (re)fetch assignments when the sheet
  // target changes, guarded so a fast NDA-switch / close doesn't write stale
  // assignments. All state-sets live inside the async IIFE (set-state-in-effect
  // rule stays satisfied). reload() stays for the post-add refetch.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      setUserId("")
      setContactName("")
      setContactOrg("")
      setMode("user")
      if (!ndaId) {
        if (!cancelled) setAssignments([])
        return
      }
      setLoading(true)
      try {
        const list = await listNdaAssignments(projectId, ndaId)
        if (!cancelled) setAssignments(list)
      } catch (err) {
        if (!cancelled)
          toast.error("Zuordnungen konnten nicht geladen werden", {
            description: err instanceof Error ? err.message : "Unbekannter Fehler",
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, ndaId])

  const handleAdd = async () => {
    if (!ndaId) return
    if (mode === "user" && !userId) {
      toast.error("Bitte ein Mitglied wählen.")
      return
    }
    if (mode === "contact" && !contactName.trim() && !contactOrg.trim()) {
      toast.error("Name oder Organisation angeben.")
      return
    }
    setAdding(true)
    try {
      await assignNda(
        projectId,
        ndaId,
        mode === "user"
          ? { user_id: userId }
          : {
              contact_name: contactName.trim() || null,
              contact_org: contactOrg.trim() || null,
            }
      )
      toast.success("Zuordnung hinzugefügt")
      setUserId("")
      setContactName("")
      setContactOrg("")
      await reload()
    } catch (err) {
      toast.error("Zuordnung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (assignmentId: string) => {
    if (!ndaId) return
    try {
      await deleteNdaAssignment(projectId, ndaId, assignmentId)
      toast.success("Zuordnung entfernt")
      await reload()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Sheet open={nda !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Personen-Zuordnung</SheetTitle>
          <SheetDescription>
            {nda
              ? `NDA „${nda.counterparty}". Nur ein verknüpftes Nutzerkonto verschafft technischen Zugriff; reine Kontakteinträge sind dokumentarisch.`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 rounded-md border p-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "user" ? "default" : "outline"}
              onClick={() => setMode("user")}
            >
              Nutzerkonto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "contact" ? "default" : "outline"}
              onClick={() => setMode("contact")}
            >
              Kontakt (dokumentarisch)
            </Button>
          </div>

          {mode === "user" ? (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Mitglied wählen" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Name (Signatory)"
                maxLength={200}
              />
              <Input
                value={contactOrg}
                onChange={(e) => setContactOrg(e.target.value)}
                placeholder="Organisation"
                maxLength={200}
              />
            </div>
          )}

          <Button size="sm" onClick={handleAdd} disabled={adding}>
            {adding && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Zuordnen
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Personen zugeordnet.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span>
                  {a.user_id ? (
                    <>
                      {nameFor(a.user_id)}{" "}
                      <Badge variant="secondary" className="ml-1">
                        Konto
                      </Badge>
                    </>
                  ) : (
                    <>
                      {a.contact_name || "—"}
                      {a.contact_org ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {a.contact_org}
                        </span>
                      ) : null}{" "}
                      <Badge variant="outline" className="ml-1">
                        Kontakt
                      </Badge>
                    </>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Zuordnung entfernen"
                  onClick={() => handleRemove(a.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
