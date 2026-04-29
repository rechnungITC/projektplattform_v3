import type { Metadata } from "next"

import { CommunicationTabClient } from "@/components/projects/communication/communication-tab-client"

export const metadata: Metadata = {
  title: "Kommunikation · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectKommunikationPage({ params }: PageProps) {
  const { id } = await params
  // Read server-only env to decide whether to surface the stub-mode banner.
  // The actual fall-back happens inside the email channel adapter — this is
  // purely a UI hint.
  const emailStubMode = !process.env.RESEND_API_KEY
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <CommunicationTabClient projectId={id} emailStubMode={emailStubMode} />
    </div>
  )
}
