import type { Metadata } from "next"

import { StammdatenGrid } from "@/components/master-data/stammdaten-grid"

export const metadata: Metadata = {
  title: "Stammdaten · Projektplattform",
}

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

      {/* PROJ-Y-143k — the grid is a client component because it reads the
          tenant's active modules; the page stays a server component so the
          metadata export and the static header cost nothing on the client. */}
      <StammdatenGrid />
    </div>
  )
}
