"use client"

import { Download, Loader2, Printer } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { useSteeringReport } from "@/hooks/use-steering-report"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { steeringReportExportUrl } from "@/lib/ma-project/steering-report-api"
import type { SteeringExportSection } from "@/types/steering-report"

import { SteeringReportBody } from "./steering-report-body"

const EXPORT_SECTIONS: { section: SteeringExportSection; label: string }[] = [
  { section: "findings", label: "Red Flags" },
  { section: "risks", label: "Risiken" },
  { section: "tasks", label: "Aufgaben" },
]

export function SteeringReportView({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { report, loading, error, refresh } = useSteeringReport(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const member of members) {
      m.set(member.user_id, member.display_name ?? member.email.split("@")[0] ?? "—")
    }
    return m
  }, [members])

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-base">Steering-Dashboard</CardTitle>
          <CardDescription>
            Management-/Steering-Sicht pro Deal: Phase &amp; nächstes Stage-Gate, Top Red
            Flags (DD-Findings &amp; High-Risiken), kritische offene Aufgaben. Beschränkt auf
            Ihren Berechtigungskontext.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">CSV:</span>
          {EXPORT_SECTIONS.map((e) => (
            <Button key={e.section} asChild size="sm" variant="outline">
              <a href={steeringReportExportUrl(projectId, e.section)} download>
                <Download className="h-3.5 w-3.5" aria-hidden />
                {e.label}
              </a>
            </Button>
          ))}
          <Button asChild size="sm" variant="outline">
            <a
              href={`/projects/${projectId}/steering-report/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer className="mr-1 h-4 w-4" aria-hidden /> Drucken / PDF
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Lade Steering-Dashboard …
          </div>
        ) : error ? (
          <div className="space-y-3 py-6">
            <p className="text-sm text-destructive">
              Steering-Dashboard konnte nicht geladen werden: {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              Erneut versuchen
            </Button>
          </div>
        ) : report ? (
          <SteeringReportBody report={report} userName={userName} projectId={projectId} />
        ) : null}
      </CardContent>
    </Card>
  )
}
