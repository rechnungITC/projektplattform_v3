import type { Metadata } from "next"
import { BarChart3 } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Reports · Projektplattform",
}

export default function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Reports"
        description="Kommt mit PROJ-7 (Output Domain)."
        icon={BarChart3}
      >
        Auswertungen, Dashboards und Exporte landen hier, sobald die
        Output-Domäne ausgeliefert ist.
      </ComingSoonCard>
    </div>
  )
}
