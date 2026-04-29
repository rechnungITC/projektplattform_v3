import type { Metadata } from "next"
import { ChevronRight, Database, Users } from "lucide-react"
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

const SECTIONS = [
  {
    href: "/stammdaten/resources",
    icon: Users,
    title: "Ressourcen",
    description:
      "Mandantenweiter Pool plannbarer Personen und Parteien. FTE, Verfügbarkeit, Allokationen.",
  },
]

export default function StammdatenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Stammdaten</h1>
        <p className="text-sm text-muted-foreground">
          Zentrale Master-Daten. Stakeholder werden weiter pro Projekt
          gepflegt; weitere Bereiche (Lieferanten, …) folgen mit PROJ-15 / 16.
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
              </Card>
            </Link>
          )
        })}
        <Card className="h-full">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Database className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base text-muted-foreground">
                Lieferanten · Master-Daten
              </CardTitle>
              <CardDescription className="mt-1">
                Folgt mit PROJ-15 / PROJ-16.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Demnächst.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
