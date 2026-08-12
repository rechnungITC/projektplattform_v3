"use client"

import { Link2, Loader2, ShieldAlert, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { AuditChainResult } from "@/components/audit/audit-chain-result"
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
import { useAuth } from "@/hooks/use-auth"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import {
  type AuditReaderGrant,
  endOfDayIso,
  grantAuditReader,
  grantStatus,
  listAuditReaders,
  revokeAuditReader,
} from "@/lib/audit/audit-readers-api"
import {
  type AuditChainStatus,
  fetchAuditChainStatus,
} from "@/lib/audit/audit-chain-api"

const EXTERNAL = "__external__"

const STATUS_VARIANT: Record<
  ReturnType<typeof grantStatus>,
  "default" | "secondary" | "outline"
> = {
  aktiv: "default",
  unbefristet: "secondary",
  abgelaufen: "outline",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * PROJ-130-γ2b — Verwaltung der Revisions-Leseberechtigung am Audit-Trail.
 *
 * Zwei Dinge, die diese Oberfläche sichtbar machen muss, weil sie sonst falsch
 * bedient wird:
 *
 * 1. Ein **externer Prüfer ist bewusst kein Mandanten-Mitglied** (γ2: ein vierter
 *    Rollenwert hätte ihn automatisch überall lesend gemacht). Er erscheint
 *    deshalb NICHT in der Mitglieder-Auswahl — eine reine Mitglieder-Liste wäre am
 *    Zweck vorbei. Für ihn gibt es die Konto-Kennung.
 * 2. Eine **abgelaufene Freigabe wirkt nicht mehr**, steht aber weiter in der
 *    Liste. Ohne Statusspalte hält ein Administrator einen Prüfer für berechtigt,
 *    der längst nichts mehr sieht.
 */
export function AuditReadersPageClient() {
  const { currentTenant, currentRole } = useAuth()
  const tenantId = currentTenant?.id ?? null
  const isAdmin = currentRole === "admin"

  const { members } = useTenantMembers(isAdmin ? tenantId : null)
  const [grants, setGrants] = React.useState<AuditReaderGrant[]>([])
  // `hasLoaded` statt eines `loading`-Flags: der erste Ladevorgang darf nicht
  // „keine Freigaben erteilt" zeigen, solange nichts geladen wurde — das wäre eine
  // falsche Aussage über Berechtigungen. State wird ausschließlich NACH dem await
  // gesetzt (Haus-Muster aus use-tenant-members; `set-state-in-effect` ist im
  // Lint-Regelwerk verboten, weil der React-Compiler daran erstickt).
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  const [selected, setSelected] = React.useState<string>("")
  const [externalId, setExternalId] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [note, setNote] = React.useState("")

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  // PROJ-Y-130m: Kettenstatus wird NICHT beim Öffnen der Seite geladen. Der
  // Verifikationslauf rechnet jedes gesiegelte Fenster neu nach; das ist eine
  // ausdrückliche Handlung („Kette prüfen“), keine Beiläufigkeit beim Rendern.
  const [chain, setChain] = React.useState<AuditChainStatus | null>(null)
  const [chainError, setChainError] = React.useState<string | null>(null)
  const [chainBusy, setChainBusy] = React.useState(false)

  async function handleVerifyChain() {
    if (!tenantId) return
    setChainBusy(true)
    try {
      const result = await fetchAuditChainStatus(tenantId)
      setChain(result)
      setChainError(null)
    } catch (err) {
      setChain(null)
      setChainError(err instanceof Error ? err.message : "Prüfung fehlgeschlagen")
    } finally {
      setChainBusy(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isAdmin || !tenantId) return
      try {
        const rows = await listAuditReaders(tenantId)
        if (cancelled) return
        setGrants(rows)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen")
      } finally {
        if (!cancelled) setHasLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAdmin, tenantId, tick])

  const nameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      map.set(m.user_id, m.display_name ?? m.email ?? m.user_id)
    }
    return map
  }, [members])

  const alreadyGranted = React.useMemo(
    () => new Set(grants.map((g) => g.user_id)),
    [grants]
  )

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" aria-hidden /> Revisionszugriff
          </CardTitle>
          <CardDescription>
            Freigaben für den Audit-Trail verwaltet ausschließlich die
            Mandanten-Administration.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  async function handleGrant() {
    const userId = selected === EXTERNAL ? externalId.trim() : selected
    if (!userId) {
      toast.error("Bitte eine Person oder eine Konto-Kennung angeben.")
      return
    }
    if (!tenantId) return
    setBusy(true)
    try {
      await grantAuditReader(tenantId, {
        user_id: userId,
        valid_until: validUntil ? endOfDayIso(validUntil) : null,
        note: note.trim() || null,
      })
      toast.success("Freigabe erteilt — der Vorgang steht selbst im Audit-Trail.")
      setSelected("")
      setExternalId("")
      setValidUntil("")
      setNote("")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Freigabe fehlgeschlagen")
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(grant: AuditReaderGrant) {
    if (!tenantId) return
    setBusy(true)
    try {
      await revokeAuditReader(tenantId, grant.user_id)
      toast.success("Freigabe widerrufen.")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Widerruf fehlgeschlagen")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Revisionszugriff auf den Audit-Trail</CardTitle>
          <CardDescription>
            Eine Freigabe erlaubt das Lesen des gesamten Audit-Trails dieses
            Mandanten — <strong>ohne</strong> Projektmitgliedschaft. Sie ersetzt die
            Mitgliedschaft, nicht die Vertraulichkeitsstufe: Einträge zu streng
            vertraulichen Objekten bleiben ohne entsprechende Freischaltung
            verborgen. Schreibrechte entstehen dadurch keine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ar-person">Person</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="ar-person">
                  <SelectValue placeholder="Mitglied auswählen …" />
                </SelectTrigger>
                <SelectContent>
                  {members
                    .filter((m) => !alreadyGranted.has(m.user_id))
                    .map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name ?? m.email ?? m.user_id}
                      </SelectItem>
                    ))}
                  <SelectItem value={EXTERNAL}>
                    Externer Prüfer (Konto-Kennung eingeben) …
                  </SelectItem>
                </SelectContent>
              </Select>
              {selected === EXTERNAL ? (
                <div className="space-y-1">
                  <Input
                    aria-label="Konto-Kennung des externen Prüfers"
                    placeholder="Konto-Kennung (UUID)"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Ein externer Prüfer ist absichtlich <em>kein</em> Mitglied dieses
                    Mandanten und erscheint deshalb nicht in der Auswahl.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ar-until">Gültig bis (optional)</Label>
              <Input
                id="ar-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Leer = unbefristet. Die Freigabe endet am Ende des gewählten Tages;
                die Befristung des externen Prüfers ist damit ein Datum, kein
                zusätzliches Einladungsverfahren.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ar-note">Anlass (optional)</Label>
            <Input
              id="ar-note"
              placeholder="z. B. Jahresabschlussprüfung 2026, Ticket REV-142"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>

          <Button onClick={() => void handleGrant()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden />
            )}
            Freigabe erteilen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Erteilte Freigaben</CardTitle>
          <CardDescription>
            Abgelaufene Freigaben bleiben sichtbar, wirken aber nicht mehr — die
            Datenbank prüft die Frist bei jedem Lesezugriff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasLoaded && !error ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : grants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Keine Freigaben erteilt. Ohne Freigabe liest ausschließlich die
              Mandanten-Administration den Audit-Trail.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gültig ab</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead>Anlass</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => {
                  const status = grantStatus(g)
                  const known = nameById.get(g.user_id)
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">
                        {known ?? (
                          <span className="flex flex-col">
                            <span className="font-mono text-xs">
                              {g.user_id.slice(0, 8)}…
                            </span>
                            <span className="text-muted-foreground text-xs">
                              kein Mitglied dieses Mandanten
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(g.valid_from)}</TableCell>
                      <TableCell>{formatDate(g.valid_until)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {g.note ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleRevoke(g)}
                          aria-label="Freigabe widerrufen"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" aria-hidden /> Manipulationsnachweis
          </CardTitle>
          <CardDescription>
            Änderungs-Trail und Zugriffsprotokoll sind auf Datenbankebene gegen
            Änderung und Löschung gesperrt — für jede Rolle. Die Prüfwert-Kette
            beweist zusätzlich, ob trotzdem etwas verändert wurde: sie rechnet jedes
            gesiegelte Tagesfenster nach und prüft, ob die Anker noch aneinander
            hängen. Beide Protokolle haben ihre eigene, unabhängige Kette.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => void handleVerifyChain()} disabled={chainBusy}>
            {chainBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            Kette prüfen
          </Button>

          {chainError ? <p className="text-destructive text-sm">{chainError}</p> : null}

          {chain ? <AuditChainResult status={chain} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}
