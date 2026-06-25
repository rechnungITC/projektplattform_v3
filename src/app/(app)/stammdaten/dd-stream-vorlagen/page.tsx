import type { Metadata } from "next"

import { DdStreamTemplatesPageClient } from "@/components/master-data/dd-stream-templates-page-client"

export const metadata: Metadata = {
  title: "DD-Stream-Vorlagen · Stammdaten",
}

export default function StammdatenDdStreamTemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <DdStreamTemplatesPageClient />
    </div>
  )
}
