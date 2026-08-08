"use client"

import {
  Clock,
  Download,
  Eye,
  Loader2,
  Lock,
  Printer,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  addInnerCircleMember,
  dissolveInnerCircle,
  entryExportUrl,
  listAccessLog,
  listInnerCircle,
  removeInnerCircleMember,
  setEmbargo,
  setInnerCircle,
  type CommunicationAccessLogEntry,
  type CommunicationEntry,
  type InnerCircleMember,
} from "@/lib/ma-project/communication-api"
import {
  ACCESS_LOG_ACTION_LABELS,
  type AccessLogAction,
} from "@/types/communication-matrix"

/**
 * PROJ-119 — confidentiality controls for a single communication entry:
 * inner circle (AC3), embargo (AC4) and the access log (AC2 / DoD).
 *
 * Deliberately part of the existing Kommunikationsmatrix page rather than a new
 * navigation entry.
 */

interface Member {
  user_id: string
  name: string
}

/** Local ISO (no seconds) <-> UTC ISO for the datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export function CommunicationGovernanceSheet({
  projectId,
  entry,
  members,
  canManage,
  isTenantAdmin,
  onClose,
  onChanged,
}: {
  projectId: string
  entry: CommunicationEntry
  members: Member[]
  canManage: boolean
  isTenantAdmin: boolean
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const [circle, setCircle] = React.useState<InnerCircleMember[]>([])
  const [log, setLog] = React.useState<CommunicationAccessLogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [addUser, setAddUser] = React.useState<string>("")
  const [embargoInput, setEmbargoInput] = React.useState(toLocalInput(entry.embargo_at))
  const [dissolveReason, setDissolveReason] = React.useState("")
  const [showDissolve, setShowDissolve] = React.useState(false)

  const restricted = entry.is_inner_circle || entry.confidentiality_level === "strict"

  const reload = React.useCallback(async () => {
    const [c, l] = await Promise.all([
      listInnerCircle(projectId, entry.id).catch(() => [] as InnerCircleMember[]),
      listAccessLog(projectId, entry.id).catch(
        () => [] as CommunicationAccessLogEntry[]
      ),
    ])
    setCircle(c)
    setLog(l)
  }, [projectId, entry.id])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [c, l] = await Promise.all([
        listInnerCircle(projectId, entry.id).catch(() => [] as InnerCircleMember[]),
        listAccessLog(projectId, entry.id).catch(
          () => [] as CommunicationAccessLogEntry[]
        ),
      ])
      if (!cancelled) {
        setCircle(c)
        setLog(l)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, entry.id])

  const memberName = React.useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((x) => m.set(x.user_id, x.name))
    return m
  }, [members])

  const addable = React.useMemo(
    () => members.filter((m) => !circle.some((c) => c.user_id === m.user_id)),
    [members, circle]
  )

  async function wrap(fn: () => Promise<void>, okMsg: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(okMsg)
      await reload()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" aria-hidden /> Vertraulichkeit &amp; Zugriff
          </SheetTitle>
          <SheetDescription>
            Inner Circle, Embargo und Zugriffsprotokoll für diesen
            Kommunikationseintrag.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <Tabs defaultValue="circle">
            <TabsList className="w-full">
              <TabsTrigger value="circle" className="flex-1">
                Inner Circle
              </TabsTrigger>
              <TabsTrigger value="embargo" className="flex-1">
                Embargo
              </TabsTrigger>
              <TabsTrigger value="log" className="flex-1">
                Protokoll
              </TabsTrigger>
            </TabsList>

            {/* ── Inner Circle (AC3) ─────────────────────────────────────── */}
            <TabsContent value="circle" className="space-y-4 pt-4">
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="inner-circle-toggle" className="font-medium">
                    Inner Circle
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Beschränkt die Sichtbarkeit auf die unten benannten Personen —
                    unabhängig von Projektrolle und Freigabestufe und{" "}
                    <strong>auch für Tenant-Administratoren</strong>. Diese können
                    den Kreis nur protokolliert auflösen, nicht still mitlesen.
                  </p>
                </div>
                <Switch
                  id="inner-circle-toggle"
                  checked={entry.is_inner_circle}
                  disabled={!canManage || busy}
                  onCheckedChange={(v) =>
                    wrap(
                      async () => {
                        await setInnerCircle(projectId, entry.id, v)
                      },
                      v ? "Inner Circle aktiviert." : "Inner Circle deaktiviert."
                    )
                  }
                />
              </div>

              {entry.is_inner_circle && (
                <>
                  {loading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {circle.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span>
                            {memberName.get(c.user_id) ?? c.user_id.slice(0, 8)}
                          </span>
                          {canManage && circle.length > 1 && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Aus Inner Circle entfernen"
                              disabled={busy}
                              onClick={() =>
                                wrap(async () => {
                                  await removeInnerCircleMember(
                                    projectId,
                                    entry.id,
                                    c.user_id
                                  )
                                }, "Person entfernt.")
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </li>
                      ))}
                      {circle.length === 0 && (
                        <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                          Keine Mitglieder sichtbar.
                        </li>
                      )}
                    </ul>
                  )}

                  {circle.length === 1 && (
                    <p className="text-xs text-muted-foreground">
                      Die letzte Person im Kreis kann nicht entfernt werden — sonst
                      wäre der Eintrag für niemanden mehr erreichbar.
                    </p>
                  )}

                  {canManage && addable.length > 0 && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="add-circle-member">Person hinzufügen</Label>
                        <Select value={addUser} onValueChange={setAddUser}>
                          <SelectTrigger id="add-circle-member" className="h-9">
                            <SelectValue placeholder="Projektmitglied wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {addable.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        disabled={!addUser || busy}
                        onClick={() =>
                          wrap(async () => {
                            await addInnerCircleMember(projectId, entry.id, addUser)
                            setAddUser("")
                          }, "Person hinzugefügt.")
                        }
                      >
                        <UserPlus className="mr-2 h-4 w-4" aria-hidden /> Hinzufügen
                      </Button>
                    </div>
                  )}

                  {isTenantAdmin && (
                    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <ShieldAlert className="h-4 w-4" aria-hidden /> Notzugriff
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Als Tenant-Administrator können Sie den Kreis auflösen. Das
                        wird protokolliert und im Änderungsverlauf festgehalten —
                        stilles Mitlesen ist nicht möglich.
                      </p>
                      {!showDissolve ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setShowDissolve(true)}
                        >
                          Kreis auflösen
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={dissolveReason}
                            maxLength={100}
                            onChange={(e) => setDissolveReason(e.target.value)}
                            placeholder="Begründung (erforderlich)"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy || !dissolveReason.trim()}
                              onClick={() =>
                                wrap(async () => {
                                  await dissolveInnerCircle(
                                    projectId,
                                    entry.id,
                                    dissolveReason.trim()
                                  )
                                  setShowDissolve(false)
                                  setDissolveReason("")
                                }, "Inner Circle aufgelöst.")
                              }
                            >
                              Auflösung bestätigen
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowDissolve(false)}
                            >
                              Abbrechen
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Embargo (AC4) ──────────────────────────────────────────── */}
            <TabsContent value="embargo" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="embargo-at">Embargo (Datum und Uhrzeit)</Label>
                <Input
                  id="embargo-at"
                  type="datetime-local"
                  value={embargoInput}
                  disabled={!canManage || busy}
                  onChange={(e) => setEmbargoInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Solange das Embargo nicht erreicht ist, lässt sich der Eintrag
                  nicht auf „Versendet" setzen. Es gibt bewusst keine
                  Übersteuerung — der Weg ist, das Embargo zu ändern, was im
                  Änderungsverlauf festgehalten wird. Zeitzone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                </p>
                {entry.embargo_at && (
                  <p className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" aria-hidden />
                    Aktuell: {fmtDateTime(entry.embargo_at)}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      wrap(async () => {
                        await setEmbargo(
                          projectId,
                          entry.id,
                          embargoInput ? new Date(embargoInput).toISOString() : null
                        )
                      }, "Embargo gespeichert.")
                    }
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Embargo speichern
                  </Button>
                  {entry.embargo_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        wrap(async () => {
                          await setEmbargo(projectId, entry.id, null)
                          setEmbargoInput("")
                        }, "Embargo entfernt.")
                      }
                    >
                      Embargo entfernen
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Access log (AC2 / DoD) ─────────────────────────────────── */}
            <TabsContent value="log" className="space-y-4 pt-4">
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Export &amp; Druckansicht</p>
                {restricted ? (
                  <p className="text-xs text-muted-foreground">
                    {entry.is_inner_circle
                      ? "Inner-Circle-Inhalte können nicht exportiert oder gedruckt werden."
                      : "Streng vertrauliche Inhalte können nicht exportiert oder gedruckt werden."}{" "}
                    Versuche werden protokolliert.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {entry.confidentiality_level === "confidential"
                        ? "Jeder Export und jede Druckansicht wird protokolliert."
                        : "Export ist ohne Protokollierung möglich (Stufe Standard)."}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={entryExportUrl(projectId, entry.id)}>
                          <Download className="mr-2 h-4 w-4" aria-hidden /> CSV
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          wrap(async () => {
                            const res = await fetch(
                              `/api/projects/${projectId}/communication-entries/${entry.id}/export?as=print`
                            )
                            if (!res.ok) throw new Error("Druckansicht abgelehnt.")
                            window.print()
                          }, "Druckansicht geöffnet.")
                        }
                      >
                        <Printer className="mr-2 h-4 w-4" aria-hidden /> Drucken
                      </Button>
                    </div>
                  </>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Hinweis: Bildschirmfotos und das Abtippen von Inhalten lassen sich
                  technisch nicht verhindern. Deshalb sind Inner-Circle-Inhalte gar
                  nicht erst exportierbar.
                </p>
              </div>

              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : log.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Noch keine protokollierten Zugriffe.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {log.map((l) => (
                    <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                      <Eye
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {ACCESS_LOG_ACTION_LABELS[l.action as AccessLogAction] ??
                            l.action}{" "}
                          <Badge
                            variant={
                              l.outcome === "denied" ? "destructive" : "outline"
                            }
                            className="ml-1 align-middle"
                          >
                            {l.outcome === "denied" ? "abgelehnt" : "gewährt"}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.user_name ?? l.user_id.slice(0, 8)} ·{" "}
                          {fmtDateTime(l.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
