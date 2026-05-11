import type { Metadata } from "next"

import { DashboardClient } from "@/components/dashboard/dashboard-client"

export const metadata: Metadata = {
  title: "Dashboard · Projektplattform",
  description:
    "My Work, Genehmigungen, Project Health und Alerts auf einen Blick.",
}

export default function DashboardPage() {
  return <DashboardClient />
}
