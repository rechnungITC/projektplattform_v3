"use client"

import { Download, Loader2, ShieldCheck } from "lucide-react"
import * as React from "react"

import { AuditChainResult } from "@/components/audit/audit-chain-result"
import { AuditReportView } from "@/components/audit/audit-report-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type AuditChainStatus,
  fetchAuditChainStatus,
} from "@/lib/audit/audit-chain-api"

export interface RevisionTenant {
  tenantId: string
  name: string
  validUntil: string | null
  note: string | null
  expired: boolean
}

function formatDate(value: string | null): string {
  if (!value) return "unbefristet"
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * PROJ-Y-130o — was ein Revisor hier tun kann, und was ausdrücklich nicht.
 *
 * Kann: die Prüfwert-Ketten eines freigegebenen Mandanten nachrechnen, den
 * Audit-Trail filterbar durchsehen (PROJ-Y-130p) und als CSV exportieren. Alle drei
 * laufen durch Gates, die serverseitig längst bestehen (`verify_audit_chain`, RLS
 * am Trail, `requireAuditRead`).
 *
 * Kann nicht: die Redaktion abschalten (Admin-Vorbehalt aus γ4) und streng
 * vertrauliche Einträge ohne eigene Freischaltung sehen (γ1-Tor in der Datenbank).
 * Beides steht hier als Hinweis, damit ein unvollständiger Export nicht für die
 * ganze Wahrheit gehalten wird — dieselbe Ehrlichkeit wie beim
 * `X-Export-Scope`-Kopf der übrigen Exporte.
 */
export function RevisionClient({ tenants }: { tenants: RevisionTenant[] }) {
  const usable = tenants.filter((t) => !t.expired)
  const [selected, setSelected] = React.useState<string>(
    usable[0]?.tenantId ?? ""
  )
  const [status, setStatus] = React.useState<AuditChainStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const active = tenants.find((t) => t.tenantId === selected) ?? null

  async function handleVerify() {
    if (!selected) return
    setBusy(true)
    try {
      setStatus(await fetchAuditChainStatus(selected))
      setError(null)
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : "Prüfung fehlgeschlagen")
    } finally {
      setBusy(false)
    }
  }

  if (tenants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revision</CardTitle>
          <CardDescription>
            Für Ihr Konto besteht derzeit keine Revisions-Freigabe. Eine Freigabe
            erteilt die Administration des betreffenden Mandanten; sie kann befristet
            sein.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Revision</h1>
        <p className="text-muted-foreground text-sm">
          Lesender Zugang zum Audit-Trail der Mandanten, für die eine Freigabe
          besteht — ohne Projektmitgliedschaft und ohne Schreibrechte.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mandant</CardTitle>
          <CardDescription>
            Es erscheinen ausschließlich Mandanten mit einer Freigabe für Ihr Konto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usable.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="rev-tenant">Freigegebener Mandant</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="rev-tenant" className="max-w-md">
                  <SelectValue placeholder="Mandant wählen …" />
                </SelectTrigger>
                <SelectContent>
                  {usable.map((t) => (
                    <SelectItem key={t.tenantId} value={t.tenantId}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {active ? (
                <p className="text-muted-foreground text-xs">
                  Freigabe gültig bis: {formatDate(active.validUntil)}
                  {active.note ? ` · Anlass: ${active.note}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {tenants.some((t) => t.expired) ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Abgelaufene Freigaben</p>
              <ul className="space-y-1 text-sm">
                {tenants
                  .filter((t) => t.expired)
                  .map((t) => (
                    <li key={t.tenantId} className="flex items-center gap-2">
                      <Badge variant="outline">abgelaufen</Badge>
                      <span>{t.name}</span>
                      <span className="text-muted-foreground text-xs">
                        endete am {formatDate(t.validUntil)}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                Eine abgelaufene Freigabe wirkt nicht mehr — die Datenbank prüft die
                Frist bei jedem Lesezugriff. Für eine erneute Prüfung braucht es eine
                neue Freigabe.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {usable.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Manipulationsnachweis</CardTitle>
              <CardDescription>
                Rechnet die Prüfwert-Ketten des gewählten Mandanten nach — je Protokoll
                getrennt (Änderungs-Trail und Zugriffsprotokoll). Die Prüfung sieht dafür
                alle Zeilen, gibt aber ausschließlich Zahlen und Urteile zurück, keine
                Inhalte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => void handleVerify()} disabled={busy || !selected}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                )}
                Kette prüfen
              </Button>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              {status ? <AuditChainResult status={status} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit-Bericht</CardTitle>
              <CardDescription>
                Dieselbe filterbare Sicht wie in der Administration (PROJ-Y-130p) —
                nach Objektart, Person, Feld und Zeitraum. Was hier erscheint,
                entscheidet die Datenbank: das Lesetor lässt Ihre Freigabe durch,
                hält streng vertrauliche Einträge ohne eigene Freischaltung aber
                zurück.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected ? (
                <AuditReportView tenantId={selected} showHeading={false} />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit-Trail exportieren</CardTitle>
              <CardDescription>
                CSV-Export der Änderungs-Einträge des gewählten Mandanten.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" disabled={!selected}>
                <a
                  href={`/api/audit/export?tenant_id=${encodeURIComponent(selected)}`}
                >
                  <Download className="h-4 w-4" aria-hidden /> Export herunterladen
                </a>
              </Button>
              <p className="text-muted-foreground text-xs">
                Zwei Grenzen, die der Export nicht verschweigt: personenbezogene Werte
                bleiben redigiert (das Abschalten der Redaktion ist der
                Mandanten-Administration vorbehalten), und Einträge zu streng
                vertraulichen Objekten erscheinen nur mit entsprechender Freischaltung.
                Ein unvollständiger Export ist deshalb nicht die ganze Wahrheit.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
