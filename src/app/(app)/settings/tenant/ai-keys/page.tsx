import type { Metadata } from "next"

import { AiKeysPageClient } from "@/components/settings/tenant/ai-keys/ai-keys-page-client"

export const metadata: Metadata = {
  title: "AI-Keys · Projektplattform",
}

export default function TenantAiKeysSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <AiKeysPageClient />
    </div>
  )
}
