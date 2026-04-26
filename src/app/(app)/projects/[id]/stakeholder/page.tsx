import type { Metadata } from "next"
import { Users } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Stakeholder · Projektplattform",
}

export default function ProjectStakeholderPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Stakeholder"
        description="Stakeholder kommen mit PROJ-8."
        icon={Users}
      >
        Wir aktivieren die Stakeholder-Verwaltung automatisch, sobald PROJ-8
        ausgeliefert ist.
      </ComingSoonCard>
    </div>
  )
}
