import type { Metadata } from "next"
import { Settings as SettingsIcon } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Einstellungen · Projektplattform",
}

export default function ProjectEinstellungenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Projekteinstellungen"
        description="Project-level settings — coming soon."
        icon={SettingsIcon}
      >
        Hier konfigurierst du in Zukunft Module, Methoden und projektspezifische
        Optionen.
      </ComingSoonCard>
    </div>
  )
}
