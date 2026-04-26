import type { Metadata } from "next"
import { ClipboardList } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Planung · Projektplattform",
}

export default function ProjectPlanungPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Planung"
        description="Phasen & Meilensteine kommen mit PROJ-19."
        icon={ClipboardList}
      >
        Wir aktivieren die Planungsansicht automatisch, sobald PROJ-19
        ausgeliefert ist.
      </ComingSoonCard>
    </div>
  )
}
