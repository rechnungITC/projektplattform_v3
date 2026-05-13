import type { Metadata } from "next"
import { Suspense } from "react"

import { OrganizationImportPageClient } from "@/components/organization/organization-import-page-client"

export const metadata: Metadata = {
  title: "Organisation Import · Stammdaten",
}

export default function StammdatenOrganisationImportPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense
        fallback={
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            Lädt…
          </div>
        }
      >
        <OrganizationImportPageClient />
      </Suspense>
    </div>
  )
}
