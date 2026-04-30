import type { Metadata } from "next"

import { TenantFxRatesPageClient } from "@/components/budget/tenant-fx-rates-page-client"

export const metadata: Metadata = {
  title: "FX-Raten · Projektplattform",
}

export default function TenantFxRatesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <TenantFxRatesPageClient />
    </div>
  )
}
