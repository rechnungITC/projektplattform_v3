import type { Metadata } from "next"

import { VendorsPageClient } from "@/components/vendors/vendors-page-client"

export const metadata: Metadata = {
  title: "Lieferanten · Stammdaten",
}

export default function StammdatenVendorsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <VendorsPageClient />
    </div>
  )
}
