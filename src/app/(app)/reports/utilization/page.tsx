import type { Metadata } from "next"

import { UtilizationHeatmap } from "@/components/resources/utilization-heatmap"

export const metadata: Metadata = {
  title: "Auslastung · Reports",
}

export default function UtilizationReportPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Auslastung
        </h1>
        <p className="text-sm text-muted-foreground">
          Mandantenweite Ressourcen-Auslastung aggregiert über alle
          Projekte. Heat-Coloring zeigt Überbuchung auf einen Blick. Nur für
          Tenant-Admins.
        </p>
      </header>
      <UtilizationHeatmap />
    </div>
  )
}
