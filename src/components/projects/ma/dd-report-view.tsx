"use client"

import { FileText, Printer } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { type DdReport, fetchDdReport } from "@/lib/ma-project/dd-findings-api"

import { DdReportBody } from "./dd-report-body"

// PROJ-116 — consolidated, live DD report (read-only) in the project room.
// Surfaces the per-stream summary + cross-stream red-flag list from the
// SECURITY-INVOKER RPC; what the caller sees is already need-to-know-filtered.
// "Drucken / PDF" opens the chrome-less /print page (PROJ-21 print-to-PDF).
export function DdReportView({ projectId }: { projectId: string }) {
  const [report, setReport] = React.useState<DdReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchDdReport(projectId)
        if (!cancelled) setReport(data)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
          setError(msg)
          toast.error("DD-Bericht konnte nicht geladen werden", { description: msg })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" aria-hidden /> DD-Bericht
          </CardTitle>
          <CardDescription>
            Konsolidierte, live aktuelle Sicht je Stream (Status, Findings, Q&amp;A) plus
            streamübergreifender Red-Flag-Report. Beschränkt auf Ihren Berechtigungskontext.
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/projects/${projectId}/dd-report/print`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Printer className="mr-2 h-4 w-4" aria-hidden /> Drucken / PDF
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : report ? (
          <DdReportBody report={report} />
        ) : null}
      </CardContent>
    </Card>
  )
}
