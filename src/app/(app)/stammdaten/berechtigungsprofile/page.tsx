import type { Metadata } from "next"

import { ClearanceProfilesPageClient } from "@/components/master-data/clearance-profiles-page-client"

export const metadata: Metadata = {
  title: "Berechtigungsprofile · Stammdaten",
}

export default function StammdatenClearanceProfilesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ClearanceProfilesPageClient />
    </div>
  )
}
