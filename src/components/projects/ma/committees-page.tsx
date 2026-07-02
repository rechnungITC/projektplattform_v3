"use client"

import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  addCommitteeMember,
  type Committee,
  type CommitteeMemberRole,
  type CommitteePayload,
  createCommittee,
  deleteCommittee,
  listCommittees,
  removeCommitteeMember,
  updateCommittee,
  updateCommitteeMember,
} from "@/lib/ma-project/committees-api"
import { listStakeholders } from "@/lib/stakeholders/api"
import {
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  MA_CONFIDENTIALITY_LEVELS,
  type MaConfidentialityLevel,
} from "@/types/confidentiality"

type StakeholderOption = { id: string; name: string }

const ROLE_LABEL: Record<CommitteeMemberRole, string> = {
  chair: "Vorsitz",
  member: "Mitglied",
  observer: "Beobachter",
}
const ROLES: CommitteeMemberRole[] = ["chair", "member", "observer"]

function levelBadgeVariant(
  l: MaConfidentialityLevel
): "default" | "secondary" | "destructive" | "outline" {
  if (l === "strict") return "destructive"
  if (l === "confidential") return "secondary"
  return "outline"
}

function fmtThreshold(value: number | null, currency: string | null): string | null {
  if (value === null || value === undefined) return null
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${value} ${currency ?? ""}`.trim()
  }
}

export function CommitteesPage({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const [committees, setCommittees] = React.useState<Committee[]>([])
  const [stakeholders, setStakeholders] = React.useState<StakeholderOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; committee: Committee }
  >({ mode: "closed" })
  const [memberSheetFor, setMemberSheetFor] = React.useState<Committee | null>(null)

  const reload = React.useCallback(async () => {
    const [c, s] = await Promise.all([
      listCommittees(projectId),
      listStakeholders(projectId).catch(() => []),
    ])
    setCommittees(c)
    setStakeholders(s.map((x) => ({ id: x.id, name: x.name })))
    // keep the open member sheet in sync with fresh data
    setMemberSheetFor((prev) => (prev ? c.find((x) => x.id === prev.id) ?? null : null))
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [c, s] = await Promise.all([
          listCommittees(projectId),
          listStakeholders(projectId).catch(() => []),
        ])
        if (!cancelled) {
          setCommittees(c)
          setStakeholders(s.map((x) => ({ id: x.id, name: x.name })))
        }
      } catch (err) {
        if (!cancelled)
          toast.error("Gremien konnten nicht geladen werden", {
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

  const handleDelete = async (c: Committee) => {
    if (!confirm(`Gremium „${c.name}" löschen?`)) return
    try {
      await deleteCommittee(projectId, c.id)
      toast.success("Gremium gelöscht")
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5" aria-hidden /> Gremien &amp; Steuerungskreise
          </h1>
          <p className="text-sm text-muted-foreground">
            Governance-Gremien (SteerCo, Core Team, IMO …) mit Besetzung und
            Entscheidungskompetenz. Sichtbarkeit richtet sich nach Ihrem
            Berechtigungskontext.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Gremium
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : committees.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          Noch keine Gremien angelegt.
        </div>
      ) : (
        <div className="space-y-4">
          {committees.map((c) => {
            const threshold = fmtThreshold(c.value_threshold_eur, c.value_threshold_currency)
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {c.name}
                      <Badge variant={levelBadgeVariant(c.confidentiality_level)}>
                        {MA_CONFIDENTIALITY_LEVEL_LABELS[c.confidentiality_level]}
                      </Badge>
                      {c.cadence && (
                        <span className="text-xs font-normal text-muted-foreground">
                          · {c.cadence}
                        </span>
                      )}
                    </CardTitle>
                    {c.purpose && <CardDescription>{c.purpose}</CardDescription>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Gremium bearbeiten"
                        onClick={() => setDialog({ mode: "edit", committee: c })}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Gremium löschen"
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {(c.decision_scope || threshold || c.escalation_scope) && (
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      {c.decision_scope && (
                        <div>
                          <dt className="text-muted-foreground">Entscheidungskompetenz</dt>
                          <dd>
                            {c.decision_scope}
                            {threshold && (
                              <span className="text-muted-foreground"> (bis {threshold})</span>
                            )}
                          </dd>
                        </div>
                      )}
                      {c.escalation_scope && (
                        <div>
                          <dt className="text-muted-foreground">Eskalationen</dt>
                          <dd>{c.escalation_scope}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Besetzung ({c.members.length})
                    </span>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => setMemberSheetFor(c)}>
                        <Users className="mr-2 h-4 w-4" aria-hidden /> Besetzung verwalten
                      </Button>
                    )}
                  </div>
                  {c.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Mitglieder.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mitglied</TableHead>
                            <TableHead>Rolle</TableHead>
                            <TableHead className="text-right">Stimmrecht</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.members.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">
                                {m.stakeholder?.name ?? m.stakeholder_id.slice(0, 8)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {ROLE_LABEL[m.role_in_committee]}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {m.is_voting ? "Ja" : "Nein"}
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
          })}
        </div>
      )}

      {dialog.mode !== "closed" && (
        <CommitteeDialog
          projectId={projectId}
          committee={dialog.mode === "edit" ? dialog.committee : null}
          onClose={() => setDialog({ mode: "closed" })}
          onSaved={async () => {
            setDialog({ mode: "closed" })
            await reload()
          }}
        />
      )}

      {memberSheetFor && (
        <MemberSheet
          projectId={projectId}
          committee={memberSheetFor}
          stakeholders={stakeholders}
          canManage={canManage}
          onClose={() => setMemberSheetFor(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

function CommitteeDialog({
  projectId,
  committee,
  onClose,
  onSaved,
}: {
  projectId: string
  committee: Committee | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const isEdit = committee !== null
  const [name, setName] = React.useState(committee?.name ?? "")
  const [purpose, setPurpose] = React.useState(committee?.purpose ?? "")
  const [cadence, setCadence] = React.useState(committee?.cadence ?? "")
  const [decisionScope, setDecisionScope] = React.useState(committee?.decision_scope ?? "")
  const [threshold, setThreshold] = React.useState(
    committee?.value_threshold_eur != null ? String(committee.value_threshold_eur) : ""
  )
  const [currency, setCurrency] = React.useState(committee?.value_threshold_currency ?? "EUR")
  const [escalationScope, setEscalationScope] = React.useState(committee?.escalation_scope ?? "")
  const [level, setLevel] = React.useState<MaConfidentialityLevel>(
    committee?.confidentiality_level ?? "standard"
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const thr = threshold.trim() === "" ? null : Number(threshold)
    if (thr !== null && (Number.isNaN(thr) || thr < 0)) {
      setError("Schwellenwert ungültig.")
      return
    }
    const payload: CommitteePayload = {
      name: name.trim(),
      purpose: purpose.trim() || null,
      cadence: cadence.trim() || null,
      decision_scope: decisionScope.trim() || null,
      value_threshold_eur: thr,
      value_threshold_currency: thr === null ? null : currency.trim().toUpperCase() || "EUR",
      escalation_scope: escalationScope.trim() || null,
      confidentiality_level: level,
    }
    setSubmitting(true)
    try {
      if (isEdit && committee) {
        await updateCommittee(projectId, committee.id, payload)
        toast.success("Gremium gespeichert")
      } else {
        await createCommittee(projectId, payload)
        toast.success("Gremium erstellt")
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
            <DialogTitle>{isEdit ? "Gremium bearbeiten" : "Gremium anlegen"}</DialogTitle>
            <DialogDescription>
              Governance-Gremium mit Zweck, Tagungsfrequenz und Entscheidungskompetenz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cm-name">Name</Label>
              <Input
                id="cm-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-purpose">Zweck (optional)</Label>
              <Textarea
                id="cm-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={2}
                maxLength={4000}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[150px] flex-1 space-y-2">
                <Label htmlFor="cm-cadence">Frequenz (optional)</Label>
                <Input
                  id="cm-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                  placeholder="z. B. wöchentlich"
                  maxLength={200}
                />
              </div>
              <div className="min-w-[150px] flex-1 space-y-2">
                <Label>Vertraulichkeit</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as MaConfidentialityLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MA_CONFIDENTIALITY_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {MA_CONFIDENTIALITY_LEVEL_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-scope">Entscheidungskompetenz (optional)</Label>
              <Textarea
                id="cm-scope"
                value={decisionScope}
                onChange={(e) => setDecisionScope(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="z. B. genehmigt Phasenübergänge"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[150px] flex-1 space-y-2">
                <Label htmlFor="cm-threshold">Wert-Schwelle (optional)</Label>
                <Input
                  id="cm-threshold"
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="z. B. 50000000"
                />
              </div>
              <div className="w-28 space-y-2">
                <Label htmlFor="cm-currency">Währung</Label>
                <Input
                  id="cm-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  maxLength={3}
                  placeholder="EUR"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-esc">Eskalationen (optional)</Label>
              <Input
                id="cm-esc"
                value={escalationScope}
                onChange={(e) => setEscalationScope(e.target.value)}
                maxLength={4000}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MemberSheet({
  projectId,
  committee,
  stakeholders,
  canManage,
  onClose,
  onChanged,
}: {
  projectId: string
  committee: Committee
  stakeholders: StakeholderOption[]
  canManage: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [stakeholderId, setStakeholderId] = React.useState("")
  const [role, setRole] = React.useState<CommitteeMemberRole>("member")
  const [isVoting, setIsVoting] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  const memberStakeholderIds = new Set(committee.members.map((m) => m.stakeholder_id))
  const available = stakeholders.filter((s) => !memberStakeholderIds.has(s.id))

  const wrap = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(okMsg)
      await onChanged()
    } catch (err) {
      toast.error("Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    wrap(async () => {
      await addCommitteeMember(projectId, committee.id, {
        stakeholder_id: stakeholderId,
        role_in_committee: role,
        is_voting: isVoting,
      })
      setStakeholderId("")
      setRole("member")
      setIsVoting(true)
    }, "Mitglied hinzugefügt")

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Besetzung — {committee.name}</SheetTitle>
          <SheetDescription>
            Mitglieder sind Stakeholder dieses Projekts. Externe (z. B. Sponsor, AR)
            werden als Stakeholder ohne Nutzerkonto geführt.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {committee.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Mitglieder.</p>
          ) : (
            <ul className="space-y-2">
              {committee.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.stakeholder?.name ?? m.stakeholder_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[m.role_in_committee]}
                      {m.is_voting ? " · stimmberechtigt" : " · ohne Stimme"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.role_in_committee}
                        onValueChange={(v) =>
                          wrap(async () => {
                            await updateCommitteeMember(projectId, committee.id, m.id, {
                              role_in_committee: v as CommitteeMemberRole,
                            })
                          }, "Rolle aktualisiert")
                        }
                      >
                        <SelectTrigger className="h-8 w-32" aria-label="Rolle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Switch
                        checked={m.is_voting}
                        aria-label="Stimmrecht"
                        onCheckedChange={(checked) =>
                          wrap(async () => {
                            await updateCommitteeMember(projectId, committee.id, m.id, {
                              is_voting: checked,
                            })
                          }, "Stimmrecht aktualisiert")
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Mitglied entfernen"
                        onClick={() =>
                          wrap(
                            () => removeCommitteeMember(projectId, committee.id, m.id),
                            "Mitglied entfernt"
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Mitglied hinzufügen</p>
              <div className="space-y-2">
                <Label>Stakeholder</Label>
                <Select value={stakeholderId} onValueChange={setStakeholderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Stakeholder wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Keine weiteren Stakeholder verfügbar.
                      </div>
                    ) : (
                      available.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Rolle</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as CommitteeMemberRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="cm-voting" checked={isVoting} onCheckedChange={setIsVoting} />
                  <Label htmlFor="cm-voting">Stimmrecht</Label>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={busy || !stakeholderId}
                onClick={add}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Hinzufügen
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}