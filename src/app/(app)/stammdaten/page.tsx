import type { Metadata } from "next"
import { Database } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Stammdaten · Projektplattform",
}

export default function StammdatenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Stammdaten"
        description="Wird mit PROJ-8 / PROJ-15 / PROJ-16 verfügbar."
        icon={Database}
      >
        Hier landen zentrale Stammdaten wie Stakeholder, Lieferanten und
        weitere Master-Daten.
      </ComingSoonCard>
    </div>
  )
}
