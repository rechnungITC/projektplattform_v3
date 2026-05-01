import { SnapshotFooter } from "./snapshot-footer"
import { SnapshotHeader } from "./snapshot-header"
import { SnapshotSection } from "./snapshot-section"
import type { SnapshotContent } from "@/lib/reports/types"

interface ExecutiveSummaryBodyProps {
  version: number
  content: SnapshotContent
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("de-DE", { dateStyle: "medium" })
}

/**
 * Pure server-rendered body for the Executive-Summary snapshot. Must
 * fit on a single A4 page when printed (spec § ST-05). Sections are
 * trimmed (top-3 instead of top-5) and tables capped at 3 rows.
 */
export function ExecutiveSummaryBody({
  version,
  content,
}: ExecutiveSummaryBodyProps) {
  const summaryText =
    content.ki_summary?.text ?? content.manual_summary ?? null
  const top3Risks = content.top_risks.slice(0, 3)
  const top3Decisions = content.top_decisions.slice(0, 3)
  const next2Milestones = content.upcoming_milestones.slice(0, 2)

  return (
    <article className="report-page mx-auto max-w-2xl">
      <SnapshotHeader
        kind="executive_summary"
        version={version}
        content={content}
      />

      <SnapshotSection title="Aktueller Stand" isEmpty={!summaryText}>
        {summaryText ? (
          <p className="text-base leading-relaxed">{summaryText}</p>
        ) : null}
      </SnapshotSection>

      <SnapshotSection
        title="Top-3-Risiken"
        isEmpty={top3Risks.length === 0}
      >
        <ul className="space-y-1">
          {top3Risks.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span>{r.title}</span>
              <span className="text-muted-foreground">
                Score {r.score} · {r.status}
              </span>
            </li>
          ))}
        </ul>
      </SnapshotSection>

      <SnapshotSection
        title="Top-3-Entscheidungen"
        isEmpty={top3Decisions.length === 0}
      >
        <ul className="space-y-1">
          {top3Decisions.map((d) => (
            <li key={d.id}>
              <span className="font-medium">{d.title}</span>
              <span className="ml-2 text-muted-foreground">
                {formatDate(d.decided_at)}
              </span>
              {d.is_revised ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                  revidiert
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </SnapshotSection>

      <SnapshotSection
        title="Nächste Meilensteine"
        isEmpty={next2Milestones.length === 0}
      >
        <ul className="space-y-1">
          {next2Milestones.map((m) => (
            <li key={m.id} className="flex justify-between gap-3">
              <span>{m.name}</span>
              <span className="text-muted-foreground">
                {formatDate(m.due_date)}
              </span>
            </li>
          ))}
        </ul>
      </SnapshotSection>

      <SnapshotFooter
        kind="executive_summary"
        version={version}
        content={content}
      />
    </article>
  )
}
