"use client"

import { Building, Sparkles, Tag, Wallet } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Erweiterte Kosten-Konfiguration — Placeholder.
 *
 * Aktuelle Tagessatz-Pflege liegt in `/settings/tenant/role-rates` und
 * deckt einen einheitlichen Tagessatz pro Rolle ab. Die folgenden
 * Erweiterungen sind als Roadmap-Platzhalter dokumentiert; Spec + Schema
 * werden separat in eigenen PROJ-Slices angelegt, sobald wir sie konkret
 * brauchen (z.B. erste Bau-Pilot-Tenants).
 *
 * Diese Sektion ändert KEIN Schema und führt KEINE Konflikte mit dem
 * existierenden Cost-Stack (PROJ-24) ein.
 */
export function CostAdvancedSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              Erweiterte Kosten-Konfiguration
            </CardTitle>
            <CardDescription>
              Roadmap für branchen-spezifische Kostenarten, interne vs externe
              Sätze und Preislisten. Aktuell als Platzhalter dokumentiert —
              tatsächliche Konfiguration kommt in eigenen Slices, sobald
              gebraucht.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            Kommt bald
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlaceholderItem
            icon={Wallet}
            title="Interne vs externe Sätze"
            body="Pro Rolle separate Tagessätze für interne Mitarbeiter (Vollkosten inkl. Overhead) und externe Dienstleister (Marktrate). Heute: ein Satz pro Rolle."
          />
          <PlaceholderItem
            icon={Tag}
            title="Preislisten"
            body="Mehrere Preisstaffeln pro Tenant (z.B. Vertrag-Standard, Strategischer-Kunde, Frame-Agreement) — pro Projekt zuweisbar."
          />
          <PlaceholderItem
            icon={Building}
            title="Kostenarten (Bau)"
            body="Branchen-Kostenarten für Bauwesen: Material, Lohn, Geräte, Fremdleistung, Nachunternehmer. Roll-up auf LV-Positionen + Stückliste-Preise."
          />
          <PlaceholderItem
            icon={Sparkles}
            title="Custom-Cost-Source-Types"
            body="Erweiterung der work_item_cost_lines.source_type-Spalte (heute: 'role_rate' und 'manual') um tenant-spezifische Quellen wie 'lv_position', 'stueckliste', 'subcontractor'."
          />
        </div>

        <Alert>
          <AlertTitle>Heute schon möglich</AlertTitle>
          <AlertDescription>
            Bis diese Erweiterungen scharfgeschaltet sind, erlauben{" "}
            <strong>Tagessätze</strong> (pro Rolle, versioniert) und{" "}
            <strong>manuelle Cost-Lines</strong> (pro Work-Item via Drawer)
            bereits den Großteil der Use-Cases. Der Cost-Stack ist generisch
            modelliert (work_item_cost_lines mit source_type) — neue Quellen
            lassen sich additiv ergänzen ohne Migration der Bestände.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

interface PlaceholderItemProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}

function PlaceholderItem({
  icon: Icon,
  title,
  body,
}: PlaceholderItemProps) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span>{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  )
}
