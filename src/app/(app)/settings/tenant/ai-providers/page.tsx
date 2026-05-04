import type { Metadata } from "next"

import { AiProvidersPageClient } from "@/components/settings/tenant/ai-providers/ai-providers-page-client"

export const metadata: Metadata = {
  title: "AI-Provider · Projektplattform",
}

export default function TenantAiProvidersSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <AiProvidersPageClient />
    </div>
  )
}
