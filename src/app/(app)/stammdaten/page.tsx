import type { Metadata } from "next"
import {
  Building2,
  ChevronRight,
  FolderTree,
  ListChecks,
  Network,
  Tags,
  Users,
  Users2,
} from "lucide-react"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Stammdaten · Projektplattform",
}

interface Section {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  /** True when only tenant_admin can navigate here. UI-only hint;
   *  server-side admin-gating happens in the API routes. */
  adminOnly?: boolean
}

const SECTIONS: Section[] = [
  {
    href: "/stammdaten/resources",
    icon: Users,
    title: "Ressourcen",
    description:
      "Mandantenweiter Pool plannbarer Personen und Parteien. FTE, Verfügbarkeit, Allokationen.",
  },
  {
    href: "/stammdaten/stakeholder",
    icon: Users2,
    title: "Stakeholder-Rollup",
    description:
      "Tenant-weite Übersicht aller Stakeholder mit Projekt-Beteiligung. Read-only — Pflege bleibt pro Projekt.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/stakeholder-types",
    icon: Tags,
    title: "Stakeholder-Typen",
    description:
      "Globale Defaults (Promoter/Supporter/Kritiker/Blockierer) plus eigene Typen pro Tenant — werden im Stakeholder-Form als Dropdown angeboten.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/projekttypen",
    icon: FolderTree,
    title: "Projekttypen",
    description:
      "Tenant-spezifische Anpassungen der Standard-Rollen und Pflicht-Infos pro Projekttyp.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/methoden",
    icon: ListChecks,
    title: "Methoden",
    description:
      "Aktivieren oder deaktivieren der verfügbaren Projektmethoden pro Tenant. Mindestens eine bleibt aktiv.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/vendors",
    icon: Building2,
    title: "Lieferanten",
    description:
      "Mandantenweiter Vendor-Pool mit Bewertungen, Dokumenten-Slots und Projekt-Zuordnungen.",
  },
  {
    href: "/stammdaten/organisation",
    icon: Network,
    title: "Organisation",
    description:
      "Unternehmensorganigramm — Gesellschaften, Standorte, Bereiche, Abteilungen und Teams als hierarchischer Baum (Tree + Tabelle).",
    adminOnly: true,
  },
]

export default function StammdatenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Stammdaten</h1>
        <p className="text-sm text-muted-foreground">
          Zentrale Master-Daten. Stakeholder-Pflege bleibt pro Projekt; das
          Rollup hier ist nur Übersicht. Lieferanten und ihre Bewertungen
          gehören in die Stammdaten.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="flex items-center justify-between text-base">
                      {s.title}
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {s.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                {s.adminOnly ? (
                  <CardContent className="text-xs text-muted-foreground">
                    Nur für Tenant-Admins.
                  </CardContent>
                ) : null}
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
