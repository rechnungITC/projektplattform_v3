"use client"

import { Loader2, ShieldAlert, Trash2, UserPlus } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import {
  addApprover,
  type ClearanceApprovalPolicy,
  type ClearanceApprover,
  type GatedLevel,
  listApprovalPolicies,
  listApprovers,
  removeApprover,
  upsertApprovalPolicy,
} from "@/lib/ma-project/four-eyes-api"

const GATED_LEVELS: { level: GatedLevel; label: string }[] = [
  { level: "confidential", label: "Vertraulich" },
  { level: "strict", label: "Streng vertraulich" },
]
const LEVEL_LABEL: Record<string, string> = {
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}

// PROJ-100c — tenant-admin config for the 4-eyes clearance approval gate:
// per-level policy (on/off + required persons) + the named approver pool.
// Default-off: a level with no enabled policy grants directly (no gate).
export function FourEyesPolicyPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" aria-hidden /> 4-Augen-Genehmigung
          </CardTitle>
          <CardDescription>
            Die Konfiguration des 4-Augen-Prinzips ist nur für Tenant-Admins
            zugänglich.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">4-Augen-Genehmigung</h1>
        <p className="text-sm text-muted-foreground">
          Optionaler Genehmigungs-Gate vor sensiblen Vertraulichkeits-Freischaltungen.
          Ist eine Stufe aktiviert, wird eine Freischaltung auf diese Stufe erst
          nach Zustimmung der konfigurierten Anzahl benannter Approver wirksam.
          Ohne aktivierte Policy bleibt die Freischaltung sofort wirksam.
        </p>
      </div>
      <PolicyPanel />
      <ApproverPoolPanel />
    </div>
  )
}

function PolicyPanel() {
  const [policies, setPolicies] = React.useState<ClearanceApprovalPolicy[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingLevel, setSavingLevel] = React.useState<GatedLevel | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listApprovalPolicies()
        if (!cancelled) setPolicies(list)
      } catch (err) {
        if (!cancelled)
          toast.error("Policies konnten nicht geladen werden", {
            description: err instanceof Error ? err.message : "Unbekannter Fehler",
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const policyFor = (level: GatedLevel) =>
    policies.find((p) => p.level === level)

  const save = async (
    level: GatedLevel,
    next: { enabled: boolean; persons_required: number }
  ) => {
    setSavingLevel(level)
    try {
      const saved = await upsertApprovalPolicy({ level, ...next })
      setPolicies((prev) => {
        const without = prev.filter((p) => p.level !== level)
        return [...without, saved]
      })
      toast.success("Policy gespeichert")
    } catch (err) {
      toast.error("Policy konnte nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSavingLevel(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Genehmigungs-Richtlinie pro Stufe</CardTitle>
        <CardDescription>
          Schalte das 4-Augen-Prinzip je Stufe ein und lege die erforderliche
          Anzahl zustimmender Personen fest (zusätzlich zum Antragsteller).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stufe</TableHead>
                  <TableHead>4-Augen aktiv</TableHead>
                  <TableHead>Zustimmende Personen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GATED_LEVELS.map(({ level, label }) => {
                  const pol = policyFor(level)
                  const enabled = pol?.enabled ?? false
                  const persons = pol?.persons_required ?? 1
                  return (
                    <TableRow key={level}>
                      <TableCell className="font-medium">
                        {label}
                        {savingLevel === level && (
                          <Loader2
                            className="ml-2 inline h-3 w-3 animate-spin"
                            aria-hidden
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={enabled}
                          aria-label={`4-Augen für ${label}`}
                          onCheckedChange={(checked) =>
                            save(level, {
                              enabled: checked,
                              persons_required: persons,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(persons)}
                          onValueChange={(v) =>
                            save(level, {
                              enabled,
                              persons_required: Number(v),
                            })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 (4-Augen)</SelectItem>
                            <SelectItem value="2">2 (6-Augen)</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                          </SelectContent>
                        </Select>
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

function ApproverPoolPanel() {
  const { currentTenant } = useAuth()
  const { members } = useTenantMembers(currentTenant?.id ?? null)
  const [approvers, setApprovers] = React.useState<ClearanceApprover[]>([])
  const [loading, setLoading] = React.useState(true)
  const [userId, setUserId] = React.useState("")
  const [level, setLevel] = React.useState<"all" | GatedLevel>("all")
  const [adding, setAdding] = React.useState(false)

  const nameFor = React.useCallback(
    (uid: string) => {
      const m = members.find((x) => x.user_id === uid)
      return m?.display_name || m?.email || uid.slice(0, 8)
    },
    [members]
  )

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setApprovers(await listApprovers())
    } catch (err) {
      toast.error("Approver konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await listApprovers()
        if (!cancelled) setApprovers(list)
      } catch (err) {
        if (!cancelled)
          toast.error("Approver konnten nicht geladen werden", {
            description: err instanceof Error ? err.message : "Unbekannter Fehler",
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleAdd = async () => {
    if (!userId) return
    setAdding(true)
    try {
      await addApprover({
        approver_user_id: userId,
        level: level === "all" ? null : level,
      })
      toast.success("Approver hinzugefügt")
      setUserId("")
      setLevel("all")
      await reload()
    } catch (err) {
      toast.error("Approver konnte nicht hinzugefügt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeApprover(id)
      setApprovers((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      toast.error("Approver konnte nicht entfernt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approver-Pool</CardTitle>
        <CardDescription>
          Benannte Personen, die sensible Freischaltungen genehmigen dürfen. Ein
          Approver kann eine Anfrage nie selbst genehmigen, die er gestellt hat
          (Funktionstrennung). „Alle Stufen“ gilt für jede aktivierte Stufe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Nutzer</span>
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
          </div>
          <div className="w-44 space-y-1">
            <span className="text-xs text-muted-foreground">Stufe</span>
            <Select
              value={level}
              onValueChange={(v) => setLevel(v as "all" | GatedLevel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Stufen</SelectItem>
                {GATED_LEVELS.map(({ level: l, label }) => (
                  <SelectItem key={l} value={l}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!userId || adding}>
            {adding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            )}
            Hinzufügen
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : approvers.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Noch keine Approver. Ohne Approver kann keine gated Freischaltung
            genehmigt werden.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approver</TableHead>
                  <TableHead>Stufe</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvers.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {nameFor(a.approver_user_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {a.level ? LEVEL_LABEL[a.level] : "Alle Stufen"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Approver entfernen"
                        onClick={() => handleRemove(a.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
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
