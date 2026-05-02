import type { Metadata } from "next"

import { ApprovalsListClient } from "./approvals-list-client"

export const metadata: Metadata = {
  title: "Genehmigungen · Projektplattform",
}

export default function ApprovalsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Offene Genehmigungen</h1>
        <p className="text-sm text-muted-foreground">
          Decisions, bei denen Sie als Approver nominiert sind und die noch
          eine Antwort erwarten.
        </p>
      </header>
      <ApprovalsListClient />
    </div>
  )
}
