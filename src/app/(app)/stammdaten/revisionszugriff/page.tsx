import type { Metadata } from "next"

import { AuditReadersPageClient } from "@/components/master-data/audit-readers-page-client"

export const metadata: Metadata = {
  title: "Revisionszugriff · Projektplattform",
}

// PROJ-130-γ2b — Verwaltung der Revisions-Leseberechtigung am Audit-Trail
// (Auditor + befristeter externer Prüfer). Die API existiert seit γ2; hier kommt
// die Bedienfläche. Der Page-Client ist admin-gegated, die eigentliche Autorität
// sind die SECURITY-DEFINER-RPCs.
export default function AuditReadersPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <AuditReadersPageClient />
    </div>
  )
}
