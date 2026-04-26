import type { Metadata } from "next"
import { Plug } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Konnektoren · Projektplattform",
}

export default function KonnektorenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Konnektoren"
        description="Kommt mit PROJ-14."
        icon={Plug}
      >
        Hier werden externe Systeme (z. B. ERP, Ticketing) angebunden.
      </ComingSoonCard>
    </div>
  )
}
