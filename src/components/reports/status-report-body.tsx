import { SnapshotFooter } from "./snapshot-footer"
import { SnapshotHeader } from "./snapshot-header"
import { SnapshotSection } from "./snapshot-section"
import type { SnapshotContent } from "@/lib/reports/types"

interface StatusReportBodyProps {
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
 * Pure server-rendered body for the Status-Report snapshot. No data
 * fetching here — `content` is the frozen JSONB persisted at create-time.
 *
 * Sections (locked order, per spec § ST-04):
 *   1. Header & Status-Light
 *   2. Phasen-Timeline (table)
 *   3. Aktuelle & nächste Meilensteine (next 5)
 *   4. Top-5-Risiken (sorted by score desc)
 *   5. Top-5-Entscheidungen (latest 5, with is_revised flag)
 *   6. Offene Punkte (count + 3 most overdue)
 *   7. Backlog-Übersicht (count by kind + status)
 *   8. Footer (version, generator, date)
 */
export function StatusReportBody({ version, content }: StatusReportBodyProps) {
  return (
    <article className="report-page mx-auto max-w-3xl">
      <SnapshotHeader kind="status_report" version={version} content={content} />

      {content.readiness && (
        <SnapshotSection title="Projekt-Setup" isEmpty={false}>
          <ReadinessBlock readiness={content.readiness} />
        </SnapshotSection>
      )}

      <SnapshotSection
        title="Phasen-Timeline"
        isEmpty={content.phases.length === 0}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Phase</th>
              <th className="py-2 pr-4 font-medium">Start</th>
              <th className="py-2 pr-4 font-medium">Ende</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {content.phases.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{p.name}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {formatDate(p.planned_start)}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {formatDate(p.planned_end)}
                </td>
                <td className="py-2">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SnapshotSection>

      <SnapshotSection
        title="Aktuelle & nächste Meilensteine"
        isEmpty={content.upcoming_milestones.length === 0}
      >
        <ul className="space-y-2">
          {content.upcoming_milestones.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted-foreground">
                {formatDate(m.due_date)} · {m.status}
              </span>
            </li>
          ))}
        </ul>
      </SnapshotSection>

      <SnapshotSection
        title="Top-5-Risiken"
        isEmpty={content.top_risks.length === 0}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Risiko</th>
              <th className="py-2 pr-4 font-medium">W</th>
              <th className="py-2 pr-4 font-medium">A</th>
              <th className="py-2 pr-4 font-medium">Score</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {content.top_risks.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{r.title}</td>
                <td className="py-2 pr-4">{r.probability}</td>
                <td className="py-2 pr-4">{r.impact}</td>
                <td className="py-2 pr-4 font-semibold">{r.score}</td>
                <td className="py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SnapshotSection>

      <SnapshotSection
        title="Top-5-Entscheidungen"
        isEmpty={content.top_decisions.length === 0}
      >
        <ul className="space-y-3">
          {content.top_decisions.map((d) => (
            <li key={d.id}>
              <p className="font-medium">
                {d.title}
                {d.is_revised ? (
                  <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
                    revidiert
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-muted-foreground">{d.decision_text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Entschieden am {formatDate(d.decided_at)}
              </p>
            </li>
          ))}
        </ul>
      </SnapshotSection>

      <SnapshotSection title="Offene Punkte">
        <p>
          <span className="font-semibold">{content.open_items_total}</span>{" "}
          offene Punkte insgesamt.
        </p>
        {content.overdue_open_items.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {content.overdue_open_items.map((oi) => (
              <li key={oi.id}>
                {oi.title}
                <span className="ml-2 text-muted-foreground">
                  (fällig {formatDate(oi.due_date)})
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </SnapshotSection>

      <SnapshotSection
        title="Backlog-Übersicht"
        isEmpty={
          Object.keys(content.work_item_counts.by_kind).length === 0 &&
          Object.keys(content.work_item_counts.by_status).length === 0
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Nach Art
            </p>
            <ul className="mt-1 space-y-1">
              {Object.entries(content.work_item_counts.by_kind).map(
                ([kind, count]) => (
                  <li key={kind} className="flex justify-between">
                    <span>{kind}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Nach Status
            </p>
            <ul className="mt-1 space-y-1">
              {Object.entries(content.work_item_counts.by_status).map(
                ([status, count]) => (
                  <li key={status} className="flex justify-between">
                    <span>{status}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </SnapshotSection>

      {content.ki_summary ? (
        <SnapshotSection title="KI-Kurzfazit">
          <p className="rounded-md border-l-4 border-primary/40 bg-muted/40 px-4 py-3 italic">
            {content.ki_summary.text}
          </p>
        </SnapshotSection>
      ) : null}

      <SnapshotFooter kind="status_report" version={version} content={content} />
    </article>
  )
}

/**
 * PROJ-56-ε — frozen readiness snapshot for the printed report.
 *
 * Mirrors the live `ReadinessChecklist` widget at a glance: state
 * badge + the three counters that drive the FE state machine.
 */
function ReadinessBlock({
  readiness,
}: {
  readiness: NonNullable<
    import("@/lib/reports/types").SnapshotContent["readiness"]
  >
}) {
  const stateLabel =
    readiness.state === "ready"
      ? "Bereit"
      : readiness.state === "ready_with_gaps"
        ? "Bereit mit Lücken"
        : "Setup unvollständig"
  const stateClass =
    readiness.state === "ready"
      ? "bg-emerald-100 text-emerald-900"
      : readiness.state === "ready_with_gaps"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-900"
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium ${stateClass}`}
      >
        {stateLabel}
      </span>
      <span className="text-sm text-muted-foreground">
        <strong className="tabular-nums">{readiness.open_blockers}</strong>{" "}
        Blocker · <strong className="tabular-nums">{readiness.open_warnings}</strong>{" "}
        Warnungen · <strong className="tabular-nums">{readiness.satisfied}</strong>{" "}
        erledigt
      </span>
    </div>
  )
}
