"use client"

import { Ban, Check, Clock, Loader2, Minus, ShieldCheck, X } from "lucide-react"
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
import { useAuth } from "@/hooks/use-auth"
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  type AccessExplainEntry,
  fetchAccessExplain,
} from "@/lib/ma-project/advisor-nda-api"
import {
  buildAccessMatrix,
  MATRIX_LEVELS,
} from "@/lib/ma-project/access-matrix"
import {
  cancelClearanceRequest,
  type ClearanceGrantRequest,
  listClearanceRequests,
  respondToClearanceRequest,
} from "@/lib/ma-project/four-eyes-api"
import {
  type AccessOverview,
  applyClearanceProfile,
  type ClearanceProfile,
  fetchAccessOverview,
  listClearanceProfiles,
} from "@/lib/ma-project/clearance-profiles-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

type ObjectType = "project" | "phase" | "work_item"

const LEVEL_LABEL: Record<string, string> = {
  standard: "Standard",
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}
const REASON_LABEL: Record<string, string> = {
  baseline: "Baseline (alle Mitglieder)",
  admin: "Admin (Vollzugriff)",
  clearance: "Freischaltung",
}
// PROJ-129 ma_access_explain reasons (richer than the 100b who_can_access set).
const EXPLAIN_REASON_LABEL: Record<string, string> = {
  baseline: "Baseline (Mitglied)",
  admin: "Admin (Vollzugriff)",
  cleared: "Freischaltung",
  no_clearance: "Keine Freischaltung",
  mandate_inactive: "Mandat inaktiv",
  nda_missing: "NDA fehlt / abgelaufen",
}

interface ClearanceRow {
  id: string
  user_id: string
  max_level: string
  valid_until: string | null
  applied_profile_id: string | null
}

export function ConfidentialityAccessCard({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null
  const { members } = useTenantMembers(tenantId)

  const nameFor = React.useCallback(
    (userId: string) => {
      const m = members.find((x) => x.user_id === userId)
      return m?.display_name || m?.email || userId.slice(0, 8)
    },
    [members]
  )

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" aria-hidden /> Vertraulichkeit & Zugriff
          </CardTitle>
          <CardDescription>
            Freischaltungen und die „Wer darf was sehen?“-Übersicht sind nur für
            die Projektleitung und Tenant-Admins sichtbar.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <ApplyProfilePanel projectId={projectId} nameFor={nameFor} members={members} />
      <PendingApprovalsPanel projectId={projectId} nameFor={nameFor} />
      <WhoCanSeePanel projectId={projectId} nameFor={nameFor} />
      <AccessMatrixPanel projectId={projectId} nameFor={nameFor} />
    </div>
  )
}

// --- Clearances list + apply-profile -------------------------------------
function ApplyProfilePanel({
  projectId,
  nameFor,
  members,
}: {
  projectId: string
  nameFor: (userId: string) => string
  members: ReturnType<typeof useTenantMembers>["members"]
}) {
  const [clearances, setClearances] = React.useState<ClearanceRow[]>([])
  const [profiles, setProfiles] = React.useState<ClearanceProfile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [userId, setUserId] = React.useState<string>("")
  const [profileId, setProfileId] = React.useState<string>("")
  const [applying, setApplying] = React.useState(false)

  const profileName = React.useCallback(
    (id: string | null) =>
      id ? (profiles.find((p) => p.id === id)?.name ?? "Profil") : null,
    [profiles]
  )

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const [profileList, res] = await Promise.all([
        listClearanceProfiles(),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/clearances`, {
          cache: "no-store",
        }),
      ])
      setProfiles(profileList)
      if (res.ok) {
        const json = (await res.json()) as { clearances: ClearanceRow[] }
        setClearances(json.clearances)
      }
    } catch (err) {
      toast.error("Freischaltungen konnten nicht geladen werden", {
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

  const activeProfiles = profiles.filter((p) => p.is_active)

  const handleApply = async () => {
    if (!userId || !profileId) return
    setApplying(true)
    try {
      const { pending } = await applyClearanceProfile(projectId, userId, profileId)
      if (pending) {
        toast.success("Profil angewendet — wartet auf Genehmigung (4-Augen)", {
          description:
            "Die Freischaltung wird erst nach Zustimmung der benannten Approver wirksam.",
        })
      } else {
        toast.success("Profil angewendet — Freischaltung vergeben")
      }
      setUserId("")
      setProfileId("")
      await reload()
    } catch (err) {
      toast.error("Profil konnte nicht angewendet werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" aria-hidden /> Freischaltungen
        </CardTitle>
        <CardDescription>
          Vergib Need-to-know-Freischaltungen über ein Profil. Profile pflegst du
          unter Stammdaten → Berechtigungsprofile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Nutzer</span>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Nutzer wählen" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Profil</span>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Aktives Profil wählen" />
              </SelectTrigger>
              <SelectContent>
                {activeProfiles.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    Keine aktiven Profile
                  </SelectItem>
                ) : (
                  activeProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {LEVEL_LABEL[p.granted_level]}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleApply} disabled={!userId || !profileId || applying}>
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Profil anwenden
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : clearances.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Noch keine Freischaltungen in diesem Projekt.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutzer</TableHead>
                  <TableHead>Stufe</TableHead>
                  <TableHead className="hidden sm:table-cell">Über Profil</TableHead>
                  <TableHead className="hidden sm:table-cell">Befristung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clearances.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{nameFor(c.user_id)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.max_level === "strict" ? "destructive" : "secondary"}
                      >
                        {LEVEL_LABEL[c.max_level] ?? c.max_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {profileName(c.applied_profile_id) ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {c.valid_until
                        ? new Date(c.valid_until).toLocaleDateString("de-DE")
                        : "unbefristet"}
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

// --- Who can see this? ----------------------------------------------------
function WhoCanSeePanel({
  projectId,
  nameFor,
}: {
  projectId: string
  nameFor: (userId: string) => string
}) {
  const [objectType, setObjectType] = React.useState<ObjectType>("project")
  const [objectId, setObjectId] = React.useState<string>(projectId)
  const [overview, setOverview] = React.useState<AccessOverview | null>(null)
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
        if (!cancelled) setOverview(null)
        return
      }
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
      try {
        const data = await fetchAccessOverview(projectId, objectType, objectId)
        if (!cancelled) setOverview(data)
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
        <CardTitle className="text-base">Wer darf das sehen?</CardTitle>
        <CardDescription>
          Genau die Personen, die das Need-to-know-Tor für das gewählte Objekt
          durchlässt. Read-only.
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
          {overview && (
            <Badge variant="outline" className="mb-1">
              Stufe: {LEVEL_LABEL[overview.confidentiality_level] ?? overview.confidentiality_level}
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
        ) : !overview || overview.entries.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Niemand hat aktuell Zugriff.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutzer</TableHead>
                  <TableHead>Zugriffsgrund</TableHead>
                  <TableHead className="hidden sm:table-cell">Stufe</TableHead>
                  <TableHead className="hidden sm:table-cell">Befristung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.entries.map((e) => (
                  <TableRow key={e.user_id}>
                    <TableCell className="font-medium">{nameFor(e.user_id)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {REASON_LABEL[e.access_reason] ?? e.access_reason}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {e.cleared_level
                        ? (LEVEL_LABEL[e.cleared_level] ?? e.cleared_level)
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {e.valid_until
                        ? new Date(e.valid_until).toLocaleDateString("de-DE")
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

// --- Project-wide access matrix (Nutzer × Stufe) -------------------------
// PROJ-100b Open Question 3 / "Later": the object-spanning complement to the
// per-object WhoCanSeePanel. Calls ma_access_explain once per level
// (standard/confidential/strict) and pivots into one grid. Gate-faithful —
// every cell is the server-side can_access_classified verdict, no second gate.
function AccessMatrixPanel({
  projectId,
  nameFor,
}: {
  projectId: string
  nameFor: (userId: string) => string
}) {
  const [rows, setRows] = React.useState<
    ReturnType<typeof buildAccessMatrix>
  >([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
      try {
        const results = await Promise.all(
          MATRIX_LEVELS.map((level) => fetchAccessExplain(projectId, { level }))
        )
        const perLevel: Partial<
          Record<MaConfidentialityLevel, AccessExplainEntry[]>
        > = {}
        MATRIX_LEVELS.forEach((level, i) => {
          perLevel[level] = results[i].entries
        })
        if (!cancelled) setRows(buildAccessMatrix(perLevel))
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
  }, [projectId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zugriffs-Matrix (projektweit)</CardTitle>
        <CardDescription>
          Wer welche Vertraulichkeitsstufe in diesem Projekt sehen darf — über
          alle Objekte hinweg. Read-only; spiegelt das Need-to-know-Tor
          (inkl. Mandat &amp; NDA für externe Berater).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Niemand hat aktuell Zugriff.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutzer</TableHead>
                  {MATRIX_LEVELS.map((level) => (
                    <TableHead key={level} className="text-center">
                      {LEVEL_LABEL[level]}
                    </TableHead>
                  ))}
                  <TableHead className="hidden sm:table-cell">Grund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {nameFor(row.user_id)}
                        {row.is_external_advisor && (
                          <Badge variant="outline" className="text-xs">
                            Extern
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    {MATRIX_LEVELS.map((level) => (
                      <TableCell key={level} className="text-center">
                        {row.access[level] ? (
                          <Check
                            className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400"
                            aria-label="Zugriff"
                          />
                        ) : (
                          <Minus
                            className="mx-auto h-4 w-4 text-muted-foreground/40"
                            aria-label="kein Zugriff"
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {EXPLAIN_REASON_LABEL[row.reason] ?? row.reason}
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

// --- Pending 4-eyes approval requests (PROJ-100c) ------------------------
// Lists clearance grants that a 4-eyes policy routed to approval. Named
// approvers approve/reject; the requester or a manager can cancel. The server
// enforces eligibility + separation-of-duty; the UI surfaces errors via toast.
function PendingApprovalsPanel({
  projectId,
  nameFor,
}: {
  projectId: string
  nameFor: (userId: string) => string
}) {
  const [requests, setRequests] = React.useState<ClearanceGrantRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setRequests(await listClearanceRequests(projectId, "pending"))
    } catch (err) {
      toast.error("Genehmigungs-Anfragen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await listClearanceRequests(projectId, "pending")
        if (!cancelled) setRequests(list)
      } catch (err) {
        if (!cancelled)
          toast.error("Genehmigungs-Anfragen konnten nicht geladen werden", {
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

  const act = async (
    reqId: string,
    fn: () => Promise<unknown>,
    okMsg: string
  ) => {
    setPendingId(reqId)
    try {
      await fn()
      toast.success(okMsg)
      await reload()
    } catch (err) {
      toast.error("Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-5 w-5" aria-hidden /> Wartet auf Genehmigung (4-Augen)
        </CardTitle>
        <CardDescription>
          Sensible Freischaltungen, die ein 4-Augen-Gate ausgelöst haben. Benannte
          Approver genehmigen oder lehnen ab; der Antragsteller oder die
          Projektleitung kann zurückziehen. Funktionstrennung wird serverseitig
          erzwungen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : requests.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Keine offenen Genehmigungs-Anfragen.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutzer</TableHead>
                  <TableHead>Stufe</TableHead>
                  <TableHead className="hidden sm:table-cell">Beantragt von</TableHead>
                  <TableHead className="hidden sm:table-cell">Quorum</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const busy = pendingId === req.id
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {nameFor(req.user_id)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.requested_level === "strict"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {LEVEL_LABEL[req.requested_level] ?? req.requested_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {nameFor(req.requested_by)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {req.quorum_required}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              act(
                                req.id,
                                () =>
                                  respondToClearanceRequest(projectId, req.id, "approve"),
                                "Genehmigt"
                              )
                            }
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Check className="h-4 w-4" aria-hidden />
                            )}
                            <span className="ml-1 hidden sm:inline">Genehmigen</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              act(
                                req.id,
                                () =>
                                  respondToClearanceRequest(projectId, req.id, "reject"),
                                "Abgelehnt"
                              )
                            }
                          >
                            <X className="h-4 w-4" aria-hidden />
                            <span className="ml-1 hidden sm:inline">Ablehnen</span>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Anfrage zurückziehen"
                            disabled={busy}
                            onClick={() =>
                              act(
                                req.id,
                                () => cancelClearanceRequest(projectId, req.id),
                                "Anfrage zurückgezogen"
                              )
                            }
                          >
                            <Ban className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
