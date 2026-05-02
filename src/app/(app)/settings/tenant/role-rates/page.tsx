import type { Metadata } from "next"

import { TenantRoleRatesPageClient } from "@/components/cost/tenant-role-rates-page-client"

export const metadata: Metadata = {
  title: "Tagessätze · Projektplattform",
}

export default function TenantRoleRatesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <TenantRoleRatesPageClient />
    </div>
  )
}
