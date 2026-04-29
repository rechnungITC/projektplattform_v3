import type { Metadata } from "next"

import { ConnectorsPageClient } from "@/components/connectors/connectors-page-client"

export const metadata: Metadata = {
  title: "Konnektoren · Projektplattform",
}

/**
 * PROJ-14 — admin-only connector registry surface.
 *
 * Auth+admin enforcement happens server-side in the API routes
 * (`/api/connectors/*`). The nav link is also admin-gated so non-admins
 * never see the entry. A direct URL hit by a non-admin lands here, the
 * client fetches `/api/connectors`, gets 403, and renders the error
 * card with the underlying message.
 */
export default function KonnektorenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ConnectorsPageClient />
    </div>
  )
}
