import type { Metadata } from "next"

import { MethodsPageClient } from "@/components/master-data/methods-page-client"

export const metadata: Metadata = {
  title: "Methoden · Stammdaten",
}

export default function StammdatenMethodenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <MethodsPageClient />
    </div>
  )
}
