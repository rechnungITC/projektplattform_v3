import type { Metadata } from "next"

import { OrganizationPageClientWrapper } from "@/components/organization/organization-page-client-wrapper"

export const metadata: Metadata = {
  title: "Organisation · Stammdaten",
}

export default function StammdatenOrganisationPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <OrganizationPageClientWrapper />
    </div>
  )
}
