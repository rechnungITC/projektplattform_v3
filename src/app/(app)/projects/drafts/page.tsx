import type { Metadata } from "next"

import { DraftsListClient } from "./drafts-list-client"

export const metadata: Metadata = {
  title: "Projekt-Entwürfe · Projektplattform",
}

export default function ProjectDraftsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <DraftsListClient />
    </div>
  )
}
