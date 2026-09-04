"use client"

import {
  AlertTriangle,
  BookOpenText,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectContext } from "@/hooks/use-project-context"
import type {
  ProjectContextCoverageState,
  ProjectContextDocumentView,
} from "@/types/project-context"

const COVERAGE_LABELS: Record<ProjectContextCoverageState, string> = {
  needs_clarification: "Klärung nötig",
  sufficient: "Ausreichend bestätigt",
  unknown: "Unbekannt",
  not_applicable: "Nicht relevant",
  skipped: "Übersprungen",
}

export function ProjectContextPage({ projectId }: { projectId: string }) {
  const { data, loading, error, refresh } = useProjectContext(projectId)

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Projektkontext wird geladen">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>Projektkontext nicht verfügbar</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Erneut laden
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpenText className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Noch kein Projektkontext dokumentiert</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Für dieses Projekt existiert noch keine freigegebene Kontextrevision.
            Bestehende Projekte bleiben dadurch unverändert nutzbar.
          </p>
        </CardContent>
      </Card>
    )
  }

  return <ProjectContextDocument document={data} />
}

export function ProjectContextDocument({
  document,
}: {
  document: ProjectContextDocumentView
}) {
  const context = document.context
  const currentCoverage = context.skill_coverage.filter((row) => !row.stale)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projektkontext</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bestätigte Fassung · Revision {document.revision_number}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{document.confidentiality_level}</Badge>
          <Badge variant="secondary">
            {context.analysis_status === "ai_analyzed"
              ? "KI-analysiert"
              : "Erfasst, nicht KI-analysiert"}
          </Badge>
        </div>
      </header>

      <Alert>
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <AlertTitle>Bestätigte Projektdokumentation</AlertTitle>
        <AlertDescription>
          Zusammenfassung, Quellen und offene Lücken stammen aus der
          menschlichen Review vor der Projektanlage. KI-Interpretationen sind
          als solche gekennzeichnet.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">
            {context.summary || "Keine zusätzliche Zusammenfassung erfasst."}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skill-Abdeckung</CardTitle>
          </CardHeader>
          <CardContent>
            {currentCoverage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Skill-Abdeckung bewertet.
              </p>
            ) : (
              <ul className="space-y-2">
                {currentCoverage.map((row) => (
                  <li
                    key={`${row.skill_id}:${row.skill_version_id ?? "unresolved"}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <span>{row.skill_name}</span>
                    <Badge variant={row.state === "sufficient" ? "default" : "secondary"}>
                      {COVERAGE_LABELS[row.state]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offene Punkte</CardTitle>
          </CardHeader>
          <CardContent>
            {context.gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine offenen Lücken dokumentiert.</p>
            ) : (
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {context.gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quellen &amp; Herkunft</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {context.statements.map((statement) => (
              <li key={statement.id} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex flex-wrap gap-2">
                  <Badge variant="outline">{statement.source_label}</Badge>
                  <Badge variant="secondary">
                    {statement.origin === "ai_interpretation"
                      ? "KI-Interpretation"
                      : "Bestätigte Quelle"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap">{statement.text}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LockKeyhole className="h-4 w-4" aria-hidden />
            Rohtranskript
          </CardTitle>
        </CardHeader>
        <CardContent>
          {document.transcript === null ? (
            <p className="text-sm text-muted-foreground">
              Das Rohtranskript hat einen engeren Zugriff als die bestätigte
              Zusammenfassung und ist für deine Rolle nicht freigegeben.
            </p>
          ) : document.transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kein Dialogtranskript vorhanden.</p>
          ) : (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {document.transcript.length} Dialogbeiträge anzeigen
              </summary>
              <ol className="mt-3 space-y-2">
                {document.transcript.map((turn) => (
                  <li key={turn.id} className="rounded-md bg-muted/40 p-3 text-sm">
                    <span className="font-medium">
                      {turn.role === "user" ? "Nutzer" : "KI"}:
                    </span>{" "}
                    {turn.content}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
