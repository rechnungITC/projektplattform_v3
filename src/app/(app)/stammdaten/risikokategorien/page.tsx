import type { Metadata } from "next"

import { RiskCategoriesPageClient } from "@/components/master-data/risk-categories-page-client"

export const metadata: Metadata = {
  title: "Risikokategorien · Stammdaten",
}

export default function StammdatenRiskCategoriesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <RiskCategoriesPageClient />
    </div>
  )
}
