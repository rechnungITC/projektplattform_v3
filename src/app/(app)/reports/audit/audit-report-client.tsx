"use client"

import { AuditReportView } from "@/components/audit/audit-report-view"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"

/**
 * PROJ-10 / PROJ-Y-130p — die Administrations-Fläche des Audit-Berichts.
 *
 * Sie tut nur noch eines: den Mandanten aus dem Sitzungskontext holen. Die Sicht
 * selbst liegt in `AuditReportView` und wird von der Revisions-Sicht
 * (PROJ-Y-130o) genauso genutzt — eine zweite Kopie würde driften.
 */
export function AuditReportClient() {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center">
          Kein aktiver Mandant ausgewählt.
        </CardContent>
      </Card>
    )
  }

  return <AuditReportView tenantId={tenantId} />
}
