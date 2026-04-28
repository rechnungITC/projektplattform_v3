import type { Metadata } from "next"

import { AuditReportClient } from "./audit-report-client"

export const metadata: Metadata = {
  title: "Audit-Bericht · Projektplattform",
}

export default function AuditReportPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <AuditReportClient />
    </div>
  )
}
