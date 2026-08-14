import type { Metadata } from "next"

import { ConstructionTradesPageClient } from "@/components/master-data/construction-trades-page-client"

export const metadata: Metadata = {
  title: "Gewerke · Stammdaten",
}

export default function StammdatenConstructionTradesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ConstructionTradesPageClient />
    </div>
  )
}
