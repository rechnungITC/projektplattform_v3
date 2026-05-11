import type { Metadata } from "next"

import { ContextSourcesPageClient } from "@/components/master-data/context-sources-page-client"

export const metadata: Metadata = {
  title: "Context Sources · Stammdaten · Projektplattform",
}

/**
 * PROJ-44-ε — Context-sources master-data page.
 * Lists registered sources in the active tenant + inline form
 * for new entries. AI processing (PROJ-44-δ proposal-from-context)
 * runs separately when a worker slice consumes the queue.
 */
export default function ContextSourcesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <ContextSourcesPageClient />
    </div>
  )
}
