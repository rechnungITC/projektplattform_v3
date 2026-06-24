"use client"

import { Loader2, Plus, Trash2, UserCog } from "lucide-react"
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
import {
  type AdvisorProfile,
  type AdvisorType,
  createAdvisor,
  deleteAdvisor,
  listAdvisors,
  type MandateStatus,
  updateAdvisor,
} from "@/lib/ma-project/advisor-nda-api"

import {
  ADVISOR_TYPE_LABEL,
  fmtDate,
  type GovernanceMember,
  mandateBadgeVariant,
  MANDATE_STATUS_LABEL,
} from "./governance-labels"

const ADVISOR_TYPES = Object.keys(ADVISOR_TYPE_LABEL) as AdvisorType[]
const MANDATE_STATUSES = Object.keys(MANDATE_STATUS_LABEL) as MandateStatus[]

// PROJ-99 — "Berater": external advisor profiles per M&A project. Each advisor
// stays a normal tenant/project member but carries an M&A profile (org, type,
// mandate window/status, scope). Access to confidential content additionally
// requires an active mandate + valid NDA + clearance (enforced server-side by
// can_access_classified — this UI only manages the profile metadata).
export function AdvisorsTab({
  projectId,
  members,
  nameFor,
}: {
  projectId: string
  members: GovernanceMember[]
  nameFor: (userId: string) => string
}) {
  const [advisors, setAdvisors] = React.useState<AdvisorProfile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AdvisorProfile | null>(null)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setAdvisors(await listAdvisors(projectId))
    } catch (err) {
      toast.error("Berater konnten nicht geladen werden", {
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

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (a: AdvisorProfile) => {
    setEditing(a)
    setDialogOpen(true)
  }

  const handleDelete = async (a: AdvisorProfile) => {
    if (
      !window.confirm(
        `Advisor-Profil für ${nameFor(a.user_id)} entfernen? Die Projekt-/Tenant-Mitgliedschaft bleibt bestehen.`
      )
    )
      return
    try {
      await deleteAdvisor(projectId, a.id)
      toast.success("Advisor-Profil entfernt")
      await reload()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  // Members not yet advisors (for the create picker).
  const availableMembers = React.useMemo(
    () => members.filter((m) => !advisors.some((a) => a.user_id === m.user_id)),
    [members, advisors]
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-5 w-5" aria-hidden /> Externe Berater
          </CardTitle>
          <CardDescription>
            Kanzleien, M&amp;A-Advisor, Wirtschaftsprüfer, Steuerberater. Mandat
            und NDA steuern den Zugriff auf vertrauliche Inhalte.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Berater einbinden
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : advisors.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Noch keine externen Berater in diesem Projekt eingebunden.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead className="hidden sm:table-cell">Typ</TableHead>
                  <TableHead>Mandat</TableHead>
                  <TableHead className="hidden md:table-cell">Laufzeit</TableHead>
                  <TableHead className="w-20 text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advisors.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {nameFor(a.user_id)}
                    </TableCell>
                    <TableCell>{a.organization}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {ADVISOR_TYPE_LABEL[a.advisor_type] ?? a.advisor_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant={mandateBadgeVariant(a.mandate_status)}>
                        {MANDATE_STATUS_LABEL[a.mandate_status] ??
                          a.mandate_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {fmtDate(a.mandate_start)} – {fmtDate(a.mandate_end)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(a)}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Advisor-Profil entfernen"
                          onClick={() => handleDelete(a)}
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

      <AdvisorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        initial={editing}
        availableMembers={availableMembers}
        members={members}
        onSaved={() => {
          setDialogOpen(false)
          void reload()
        }}
      />
    </Card>
  )
}

function AdvisorFormDialog({
  open,
  onOpenChange,
  projectId,
  initial,
  availableMembers,
  members,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  initial: AdvisorProfile | null
  availableMembers: GovernanceMember[]
  members: GovernanceMember[]
  onSaved: () => void
}) {
  const isEdit = initial !== null
  const [userId, setUserId] = React.useState("")
  const [organization, setOrganization] = React.useState("")
  const [advisorType, setAdvisorType] = React.useState<AdvisorType>("legal")
  const [mandateStatus, setMandateStatus] =
    React.useState<MandateStatus>("planned")
  const [mandateStart, setMandateStart] = React.useState("")
  const [mandateEnd, setMandateEnd] = React.useState("")
  const [responsibleUserId, setResponsibleUserId] = React.useState("")
  const [scope, setScope] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setError(null)
    if (initial) {
      setUserId(initial.user_id)
      setOrganization(initial.organization)
      setAdvisorType(initial.advisor_type)
      setMandateStatus(initial.mandate_status)
      setMandateStart(initial.mandate_start ?? "")
      setMandateEnd(initial.mandate_end ?? "")
      setResponsibleUserId(initial.responsible_user_id ?? "")
      setScope(initial.scope ?? "")
      setNotes(initial.notes ?? "")
    } else {
      setUserId("")
      setOrganization("")
      setAdvisorType("legal")
      setMandateStatus("planned")
      setMandateStart("")
      setMandateEnd("")
      setResponsibleUserId("")
      setScope("")
      setNotes("")
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEdit && !userId) {
      setError("Bitte ein Tenant-Mitglied auswählen.")
      return
    }
    if (!organization.trim()) {
      setError("Organisation ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const common = {
        organization: organization.trim(),
        advisor_type: advisorType,
        mandate_status: mandateStatus,
        mandate_start: mandateStart || null,
        mandate_end: mandateEnd || null,
        responsible_user_id: responsibleUserId || null,
        scope: scope.trim() || null,
        notes: notes.trim() || null,
      }
      if (isEdit && initial) {
        await updateAdvisor(projectId, initial.id, common)
        toast.success("Advisor-Profil aktualisiert")
      } else {
        await createAdvisor(projectId, { user_id: userId, ...common })
        toast.success("Berater eingebunden")
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
            <DialogTitle>
              {isEdit ? "Advisor-Profil bearbeiten" : "Berater einbinden"}
            </DialogTitle>
            <DialogDescription>
              Der Berater bleibt Projekt-/Tenant-Mitglied. Das Profil ergänzt
              Mandat, Organisation und Scope für die M&amp;A-Governance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!isEdit && (
              <div className="space-y-2">
                <Label>Tenant-Mitglied</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mitglied wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Alle Mitglieder sind bereits Berater
                      </SelectItem>
                    ) : (
                      availableMembers.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Externe Berater müssen vorher als Tenant-Mitglied eingeladen
                  worden sein.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="adv-org">Organisation</Label>
              <Input
                id="adv-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="z. B. Kanzlei Meyer & Partner"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Advisor-Typ</Label>
                <Select
                  value={advisorType}
                  onValueChange={(v) => setAdvisorType(v as AdvisorType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADVISOR_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ADVISOR_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mandatsstatus</Label>
                <Select
                  value={mandateStatus}
                  onValueChange={(v) => setMandateStatus(v as MandateStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANDATE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {MANDATE_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="adv-start">Mandatsbeginn</Label>
                <Input
                  id="adv-start"
                  type="date"
                  value={mandateStart}
                  onChange={(e) => setMandateStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adv-end">Mandatsende</Label>
                <Input
                  id="adv-end"
                  type="date"
                  value={mandateEnd}
                  onChange={(e) => setMandateEnd(e.target.value)}
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

            <div className="space-y-2">
              <Label htmlFor="adv-scope">Fachlicher Scope (optional)</Label>
              <Input
                id="adv-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="z. B. Legal-DD, Tax-DD"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adv-notes">Notizen (optional)</Label>
              <Textarea
                id="adv-notes"
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
              {isEdit ? "Speichern" : "Einbinden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}