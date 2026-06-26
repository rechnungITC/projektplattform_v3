"use client"

import { Network, Users } from "lucide-react"
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
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  clearWorkItemRaci,
  listWorkItemRaci,
  type RaciLetter,
  setWorkItemRaci,
} from "@/lib/ma-project/raci-api"
import {
  fetchProjectRoles,
  type RoleAssignment,
} from "@/lib/ma-project/roles-api"
import { MA_STANDARD_ROLES } from "@/lib/project-types/catalog"

const RACI_LETTERS: RaciLetter[] = ["R", "A", "C", "I"]
const RACI_LABEL: Record<RaciLetter, string> = {
  R: "Responsible",
  A: "Accountable",
  C: "Consulted",
  I: "Informed",
}

export function MaRolesRaciPage({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Network className="h-5 w-5" aria-hidden /> Rollen &amp; RACI
        </h1>
        <p className="text-sm text-muted-foreground">
          M&amp;A-Fachrollen, wer wofür zuständig ist, und die RACI-Zuordnung je
          Aufgabe.
        </p>
      </div>
      <ResponsibilityCard projectId={projectId} />
      <RaciMatrixCard projectId={projectId} />
    </div>
  )
}

// --- PROJ-97a: responsibility view --------------------------------------
function ResponsibilityCard({ projectId }: { projectId: string }) {
  const [assignments, setAssignments] = React.useState<RoleAssignment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchProjectRoles(projectId)
        if (!cancelled) setAssignments(data.assignments)
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
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" aria-hidden /> Wer ist wofür zuständig?
        </CardTitle>
        <CardDescription>
          M&amp;A-Fachrollen und die zugeordneten Stakeholder. Externe sind
          markiert. Mehrfachrollen sind möglich.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Rolle</TableHead>
                  <TableHead>Stakeholder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.role_key}>
                    <TableCell className="font-medium align-top">
                      {a.label_de}
                    </TableCell>
                    <TableCell>
                      {a.stakeholders.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {a.stakeholders.map((s) => (
                            <Badge
                              key={s.id}
                              variant={
                                s.origin === "external" ? "outline" : "secondary"
                              }
                            >
                              {s.name}
                              {s.origin === "external" && (
                                <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  extern
                                </span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      )}
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

// --- PROJ-97b: RACI matrix editor ---------------------------------------
function RaciMatrixCard({ projectId }: { projectId: string }) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { items: workItems, loading: wiLoading } = useWorkItems(projectId)
  const [workItemId, setWorkItemId] = React.useState<string>("")
  const [letters, setLetters] = React.useState<Record<string, RaciLetter>>({})
  const [loading, setLoading] = React.useState(false)
  const [busyRole, setBusyRole] = React.useState<string | null>(null)

  const loadRaci = React.useCallback(async (wid: string) => {
    if (!wid) {
      setLetters({})
      return
    }
    setLoading(true)
    try {
      const rows = await listWorkItemRaci(projectId, wid)
      const map: Record<string, RaciLetter> = {}
      for (const r of rows) map[r.role_key] = r.raci_letter
      setLetters(map)
    } catch (err) {
      toast.error("RACI konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load on work-item change
    void loadRaci(workItemId)
  }, [workItemId, loadRaci])

  const apply = async (roleKey: string, letter: RaciLetter | null) => {
    if (!workItemId) return
    setBusyRole(roleKey)
    try {
      if (letter === null) {
        await clearWorkItemRaci(projectId, workItemId, roleKey)
      } else {
        await setWorkItemRaci(projectId, workItemId, roleKey, letter)
      }
      await loadRaci(workItemId)
    } catch (err) {
      // Surface the "exactly one Accountable" conflict clearly.
      toast.error("RACI konnte nicht gesetzt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
      await loadRaci(workItemId)
    } finally {
      setBusyRole(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">RACI-Matrix je Aufgabe</CardTitle>
        <CardDescription>
          Pro Aufgabe trägt jede Fachrolle höchstens einen RACI-Buchstaben.
          Genau eine Rolle ist „Accountable“ (A) — eine zweite A wird
          serverseitig abgelehnt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full max-w-md space-y-1">
          <span className="text-xs text-muted-foreground">Aufgabe / Work-Item</span>
          <Select value={workItemId} onValueChange={setWorkItemId}>
            <SelectTrigger>
              <SelectValue
                placeholder={wiLoading ? "Lädt…" : "Work-Item wählen"}
              />
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

        {!workItemId ? (
          <p className="text-sm text-muted-foreground">
            Wähle ein Work-Item, um die RACI-Zuordnung zu bearbeiten.
          </p>
        ) : loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Rolle</TableHead>
                  {RACI_LETTERS.map((l) => (
                    <TableHead key={l} className="text-center" title={RACI_LABEL[l]}>
                      {l}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MA_STANDARD_ROLES.map((role) => {
                  const current = letters[role.key]
                  return (
                    <TableRow key={role.key}>
                      <TableCell className="font-medium">{role.label_de}</TableCell>
                      {RACI_LETTERS.map((l) => {
                        const active = current === l
                        return (
                          <TableCell key={l} className="text-center">
                            <Button
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              className="h-7 w-9 p-0"
                              disabled={!canEdit || busyRole === role.key}
                              aria-pressed={active}
                              aria-label={`${role.label_de}: ${RACI_LABEL[l]}${active ? " (aktiv, klicken zum Entfernen)" : ""}`}
                              onClick={() => apply(role.key, active ? null : l)}
                            >
                              {l}
                            </Button>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {workItemId && !canEdit && (
          <p className="text-xs text-muted-foreground">
            Nur Projektleitung / Bearbeiter können die RACI-Zuordnung ändern.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
