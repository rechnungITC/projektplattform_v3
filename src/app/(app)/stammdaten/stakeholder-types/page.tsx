import type { Metadata } from "next"

import { StakeholderTypesPageClient } from "@/components/master-data/stakeholder-types-page-client"

export const metadata: Metadata = {
  title: "Stakeholder-Typen · Stammdaten",
}

export default function StammdatenStakeholderTypesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <StakeholderTypesPageClient />
    </div>
  )
}
