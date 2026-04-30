import type { Metadata } from "next"

import { StakeholderRollupClient } from "@/components/master-data/stakeholder-rollup-client"

export const metadata: Metadata = {
  title: "Stakeholder-Rollup · Stammdaten",
}

export default function StammdatenStakeholderPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <StakeholderRollupClient />
    </div>
  )
}
