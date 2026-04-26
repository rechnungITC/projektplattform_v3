import type { Metadata } from "next"
import { ListTodo } from "lucide-react"

import { ComingSoonCard } from "@/components/app/coming-soon-card"

export const metadata: Metadata = {
  title: "Backlog · Projektplattform",
}

export default function ProjectBacklogPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoonCard
        title="Backlog"
        description="Work Items kommen mit PROJ-9."
        icon={ListTodo}
      >
        Wir aktivieren das Backlog automatisch, sobald PROJ-9 ausgeliefert
        ist.
      </ComingSoonCard>
    </div>
  )
}
