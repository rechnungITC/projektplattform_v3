import type { Metadata } from "next"

import { DashboardWelcome } from "./dashboard-welcome"

export const metadata: Metadata = {
  title: "Dashboard · Projektplattform",
}

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <DashboardWelcome />
    </div>
  )
}
