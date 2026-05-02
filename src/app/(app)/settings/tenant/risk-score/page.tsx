import type { Metadata } from "next"

import { RiskScorePageClient } from "@/components/settings/tenant/risk-score/risk-score-page-client"

export const metadata: Metadata = {
  title: "Risk-Score-Konfiguration · Projektplattform",
}

export default function TenantRiskScoreSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <RiskScorePageClient />
    </div>
  )
}
