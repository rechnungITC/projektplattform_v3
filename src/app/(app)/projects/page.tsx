import type { Metadata } from "next"

import { ProjectsListClient } from "./projects-list-client"

export const metadata: Metadata = {
  title: "Projects · Projektplattform",
}

export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectsListClient />
    </div>
  )
}
